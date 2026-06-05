import { circleIntersectsAabb } from "../Aabb2D.js";
import { OCTILE_OFFSETS } from "../../Spatial/grid/GridUtils.js";
import {
    worldToGridCentered,
    gridToWorldCentered,
    getCellBoundsCentered,
} from "../../Spatial/grid/GridCoords.js";

const MAX_CACHE = 100;

/**
 * Sliding-window flow-field over a NavGraph. BFS runs in an injected worker;
 * sampling uses sampleFlowDirection.js.
 */
export class FlowFieldGrid {
    /**
     * @param {number} cellSize
     * @param {number} width
     * @param {number} height
     * @param {import("./NavGraph.js").NavGraph} navGraph
     * @param {URL | string} workerUrl
     */
    constructor(cellSize, width, height, navGraph, workerUrl) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.navGraph = navGraph;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        const size = this.cols * this.rows;

        this.sabObstacle = new SharedArrayBuffer(size);
        this.grid = new Uint8Array(this.sabObstacle);

        this.sabNeighbors = new SharedArrayBuffer(size * 8 * 4);
        const neighborGrid = new Int32Array(this.sabNeighbors).fill(-1);
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const base = (row * this.cols + col) * 8;
                let i = 0;
                for (const { dc, dr } of OCTILE_OFFSETS) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                        neighborGrid[base + i] = nr * this.cols + nc;
                    }
                    i++;
                }
            }
        }

        this.sabFlowPool = new SharedArrayBuffer(size * MAX_CACHE);
        this.cacheLookup = new Int32Array(size).fill(-1);
        this.cacheCounter = 0;

        if (!workerUrl) {
            throw new Error("FlowFieldGrid requires an injected workerUrl");
        }
        this.worker = new Worker(workerUrl, { type: "module" });
        this.worker.postMessage({
            type: "init",
            data: {
                GRID_WIDTH: this.cols,
                GRID_SIZE: size,
                sabObstacle: this.sabObstacle,
                sabNeighbors: this.sabNeighbors,
                sabFlowPool: this.sabFlowPool,
            },
        });

        this.offsetX = (width / 2) + (cellSize / 2);
        this.offsetY = (height / 2) + (cellSize / 2);
        this.centerX = 0;
        this.centerY = 0;
    }

    refresh(_targetX, _targetY, _playerTargetX = null, _playerTargetY = null) {
        this.syncLocalObstacles();
    }

    shiftCenter(newCenterX, newCenterY, targetX, targetY, playerTargetX = null, playerTargetY = null) {
        this.centerX = newCenterX;
        this.centerY = newCenterY;
        this.refresh(targetX, targetY, playerTargetX, playerTargetY);
    }

    syncLocalObstacles() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const wx = col * this.cellSize + this.centerX - this.offsetX + this.cellSize / 2;
                const wy = row * this.cellSize + this.centerY - this.offsetY + this.cellSize / 2;
                const worldCell = this.navGraph.worldToGrid(wx, wy);
                const idx = row * this.cols + col;

                if (
                    worldCell.col >= 0 && worldCell.col < this.navGraph.cols &&
                    worldCell.row >= 0 && worldCell.row < this.navGraph.rows
                ) {
                    const worldIdx = worldCell.row * this.navGraph.cols + worldCell.col;
                    this.grid[idx] = this.navGraph.grid[worldIdx];
                } else {
                    this.grid[idx] = 1;
                }
            }
        }
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
    }

    getFlowField(targetX, targetY, range = 999999) {
        const target = this.worldToGrid(targetX, targetY);
        if (target.col < 0 || target.col >= this.cols || target.row < 0 || target.row >= this.rows) {
            return null;
        }

        const targetIdx = target.row * this.cols + target.col;
        let slot = this.cacheLookup[targetIdx];

        if (slot === -1) {
            if (this.cacheCounter >= MAX_CACHE) {
                this.cacheLookup.fill(-1);
                this.cacheCounter = 0;
            }
            slot = this.cacheCounter++;
            this.cacheLookup[targetIdx] = slot;

            const size = this.cols * this.rows;
            const flowField = new Uint8Array(this.sabFlowPool, slot * size, size);
            flowField.fill(255);

            this.worker.postMessage({
                type: "updateFlow",
                slot,
                tx: target.col,
                ty: target.row,
                range,
            });
            return flowField;
        }

        const size = this.cols * this.rows;
        return new Uint8Array(this.sabFlowPool, slot * size, size);
    }

    checkReachability(startX, startY, targetX, targetY) {
        const start = this.worldToGrid(startX, startY);
        const target = this.worldToGrid(targetX, targetY);

        if (start.col < 0 || start.col >= this.cols || start.row < 0 || start.row >= this.rows) return false;
        if (target.col < 0 || target.col >= this.cols || target.row < 0 || target.row >= this.rows) return false;

        const startIdx = start.row * this.cols + start.col;
        const targetIdx = target.row * this.cols + target.col;

        if (this.grid[startIdx] === 1 || this.grid[targetIdx] === 1) return false;

        const visited = new Uint8Array(this.cols * this.rows);
        const queue = [startIdx];
        visited[startIdx] = 1;

        const neighbors = new Int32Array(this.sabNeighbors);
        let head = 0;
        while (head < queue.length) {
            const currIdx = queue[head++];
            if (currIdx === targetIdx) return true;

            const currCol = currIdx % this.cols;
            const currRow = (currIdx / this.cols) | 0;

            for (let i = 0; i < 8; i++) {
                const nIdx = neighbors[currIdx * 8 + i];
                if (nIdx !== -1 && !visited[nIdx]) {
                    if (this.grid[nIdx] === 1) continue;

                    const nc = nIdx % this.cols;
                    const nr = (nIdx / this.cols) | 0;
                    const dx = currCol - nc;
                    const dy = currRow - nr;

                    if (dx !== 0 && dy !== 0) {
                        const check1 = this.grid[currRow * this.cols + nc];
                        const check2 = this.grid[nr * this.cols + currCol];
                        if (check1 === 1 || check2 === 1) continue;
                    }

                    visited[nIdx] = 1;
                    queue.push(nIdx);
                }
            }
        }
        return false;
    }

    clear() {
        this.grid.fill(0);
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
    }

    worldToGrid(x, y) {
        return worldToGridCentered(
            x, y,
            this.centerX, this.centerY,
            this.offsetX, this.offsetY,
            this.cellSize,
        );
    }

    gridToWorld(col, row) {
        return gridToWorldCentered(
            col, row,
            this.centerX, this.centerY,
            this.offsetX, this.offsetY,
            this.cellSize,
        );
    }

    getCellBounds(col, row) {
        return getCellBoundsCentered(
            col, row,
            this.centerX, this.centerY,
            this.offsetX, this.offsetY,
            this.cellSize,
        );
    }

    entityIntersectsCell(x, y, radius, col, row) {
        return circleIntersectsAabb(x, y, radius, this.getCellBounds(col, row));
    }
}
