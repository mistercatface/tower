import { circleIntersectsAabb } from "../../Libraries/Math/Aabb2D.js";
import { OCTILE_OFFSETS } from "../../Libraries/Spatial/grid/GridUtils.js";
import {
    worldToGridCentered,
    gridToWorldCentered,
    getCellBoundsCentered,
} from "../../Libraries/Spatial/grid/GridCoords.js";

const MAX_CACHE = 100;
const FLOW_DECODE_X = new Float32Array([-0.707, 0, 0.707, -1, 0, 1, -0.707, 0, 0.707]);
const FLOW_DECODE_Y = new Float32Array([-0.707, -1, -0.707, 0, 0, 0, 0.707, 1, 0.707]);

export class FlowFieldGrid {
    constructor(cellSize, width, height, obstacleGrid) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.obstacleGrid = obstacleGrid;
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

        this.worker = new Worker(new URL('./FlowFieldWorker.js', import.meta.url), { type: 'module' });
        this.worker.postMessage({
            type: 'init',
            data: {
                GRID_WIDTH: this.cols,
                GRID_SIZE: size,
                sabObstacle: this.sabObstacle,
                sabNeighbors: this.sabNeighbors,
                sabFlowPool: this.sabFlowPool,
            }
        });

        this.offsetX = (width / 2) + (cellSize / 2);
        this.offsetY = (height / 2) + (cellSize / 2);
        this.centerX = 0;
        this.centerY = 0;
    }

    refresh(targetX, targetY, playerTargetX = null, playerTargetY = null) {
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
                const worldCell = this.obstacleGrid.worldToGrid(wx, wy);
                const idx = row * this.cols + col;

                if (
                    worldCell.col >= 0 && worldCell.col < this.obstacleGrid.cols &&
                    worldCell.row >= 0 && worldCell.row < this.obstacleGrid.rows
                ) {
                    const worldIdx = worldCell.row * this.obstacleGrid.cols + worldCell.col;
                    this.grid[idx] = this.obstacleGrid.grid[worldIdx];
                } else {
                    this.grid[idx] = 1;
                }
            }
        }
        // Invalidate cache when obstacles change
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
            flowField.fill(255); // Fill with unreachable initially

            this.worker.postMessage({ 
                type: 'updateFlow', 
                slot: slot, 
                tx: target.col, 
                ty: target.row, 
                range: range 
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

        let head = 0;
        while (head < queue.length) {
            const currIdx = queue[head++];
            if (currIdx === targetIdx) return true;

            const currCol = currIdx % this.cols;
            const currRow = (currIdx / this.cols) | 0;

            for (let i = 0; i < 8; i++) {
                const nIdx = new Int32Array(this.sabNeighbors)[currIdx * 8 + i];
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

    sampleDirection(x, y, flowField, outEntity) {
        if (!flowField) return false;

        const halfCell = this.cellSize / 2;
        const gx = (x - (this.centerX - this.offsetX + halfCell)) / this.cellSize;
        const gy = (y - (this.centerY - this.offsetY + halfCell)) / this.cellSize;
        const col0 = Math.floor(gx);
        const row0 = Math.floor(gy);
        const col1 = col0 + 1;
        const row1 = row0 + 1;
        const tx = gx - col0;
        const ty = gy - row0;

        const cols = this.cols;
        const rows = this.rows;

        const c0_valid = col0 >= 0 && col0 < cols;
        const c1_valid = col1 >= 0 && col1 < cols;
        const r0_valid = row0 >= 0 && row0 < rows;
        const r1_valid = row1 >= 0 && row1 < rows;

        let flowX = 0;
        let flowY = 0;
        let totalWeight = 0;

        if (c0_valid && r0_valid) {
            const idx = row0 * cols + col0;
            const val = flowField[idx];
            if (val !== 255) {
                const w = (1 - tx) * (1 - ty);
                flowX += FLOW_DECODE_X[val] * w;
                flowY += FLOW_DECODE_Y[val] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r0_valid) {
            const idx = row0 * cols + col1;
            const val = flowField[idx];
            if (val !== 255) {
                const w = tx * (1 - ty);
                flowX += FLOW_DECODE_X[val] * w;
                flowY += FLOW_DECODE_Y[val] * w;
                totalWeight += w;
            }
        }
        if (c0_valid && r1_valid) {
            const idx = row1 * cols + col0;
            const val = flowField[idx];
            if (val !== 255) {
                const w = (1 - tx) * ty;
                flowX += FLOW_DECODE_X[val] * w;
                flowY += FLOW_DECODE_Y[val] * w;
                totalWeight += w;
            }
        }
        if (c1_valid && r1_valid) {
            const idx = row1 * cols + col1;
            const val = flowField[idx];
            if (val !== 255) {
                const w = tx * ty;
                flowX += FLOW_DECODE_X[val] * w;
                flowY += FLOW_DECODE_Y[val] * w;
                totalWeight += w;
            }
        }

        if (totalWeight > 0) {
            const len = Math.sqrt(flowX * flowX + flowY * flowY);
            if (len > 0) {
                outEntity.desiredX = flowX / len;
                outEntity.desiredY = flowY / len;
                return true;
            }
        }
        return false;
    }
}
