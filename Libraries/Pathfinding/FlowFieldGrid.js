import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { gridReachabilityBfs } from "./gridReachabilityBfs.js";
import { OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { worldToGridCentered, gridToWorldCentered, getCellBoundsCenteredInto } from "../Spatial/grid/GridCoords.js";
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
        this.neighborGrid = new Int32Array(this.sabNeighbors).fill(-1);
        this.sabFlowPool = new SharedArrayBuffer(size * MAX_CACHE);
        this.cacheLookup = new Int32Array(size).fill(-1);
        this.cacheCounter = 0;
        if (!workerUrl) throw new Error("FlowFieldGrid requires an injected workerUrl");
        this.worker = new Worker(workerUrl, { type: "module" });
        this.worker.postMessage({ type: "init", data: { GRID_WIDTH: this.cols, GRID_SIZE: size, sabObstacle: this.sabObstacle, sabNeighbors: this.sabNeighbors, sabFlowPool: this.sabFlowPool } });
        this.offsetX = width / 2 + cellSize / 2;
        this.offsetY = height / 2 + cellSize / 2;
        this.centerX = 0;
        this.centerY = 0;
        this.cellBounds = createAabb();
    }
    refresh() {
        this.syncLocalObstacles();
    }
    shiftCenter(newCenterX, newCenterY) {
        this.centerX = newCenterX;
        this.centerY = newCenterY;
        this.refresh();
    }
    syncLocalObstacles() {
        const size = this.cols * this.rows;
        const navCols = this.navGraph.cols;
        const navRows = this.navGraph.rows;
        const navGrid = this.navGraph.grid;
        const cellSize = this.cellSize;
        const half = cellSize / 2;
        const wxBase = this.centerX - this.offsetX + half;
        const wyBase = this.centerY - this.offsetY + half;
        for (let idx = 0; idx < size; idx++) {
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            const worldCell = this.navGraph.worldToGrid(col * cellSize + wxBase, row * cellSize + wyBase);
            if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) {
                this.grid[idx] = navGrid[worldCell.row * navCols + worldCell.col];
                // Update neighbor grid based on edge walls
                const base = idx * 8;
                let i = 0;
                for (const { dc, dr } of OCTILE_OFFSETS) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
                        const nextWorldCell = this.navGraph.worldToGrid(nc * cellSize + wxBase, nr * cellSize + wyBase);
                        if (this.navGraph.canStep(worldCell.col, worldCell.row, nextWorldCell.col, nextWorldCell.row)) this.neighborGrid[base + i] = nr * this.cols + nc;
                        else this.neighborGrid[base + i] = -1;
                    } else this.neighborGrid[base + i] = -1;
                    i++;
                }
            } else {
                this.grid[idx] = 1;
                const base = idx * 8;
                for (let i = 0; i < 8; i++) this.neighborGrid[base + i] = -1;
            }
        }
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
    }
    getFlowField(targetX, targetY, range = 999999) {
        const target = this.worldToGrid(targetX, targetY);
        if (target.col < 0 || target.col >= this.cols || target.row < 0 || target.row >= this.rows) return null;
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
            this.worker.postMessage({ type: "updateFlow", slot, tx: target.col, ty: target.row, range });
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
        return gridReachabilityBfs(startIdx, targetIdx, this.grid, this.neighborGrid, this.cols);
    }
    clear() {
        this.grid.fill(0);
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
    }
    worldToGrid(x, y) {
        return worldToGridCentered(x, y, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }
    gridToWorld(col, row) {
        return gridToWorldCentered(col, row, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }
    getCellBounds(col, row) {
        return getCellBoundsCenteredInto(this.cellBounds, col, row, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }
    entityIntersectsCell(x, y, radius, col, row) {
        return circleIntersectsAabb(x, y, radius, this.getCellBounds(col, row));
    }
}
