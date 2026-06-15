import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { gridReachabilityBfs } from "./gridReachabilityBfs.js";
import { OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { worldToGridCentered, gridToWorldCentered, getCellBoundsCenteredInto } from "../Spatial/grid/GridCoords.js";
import { snapshotIsBlocked, snapshotWorldToGrid, snapshotCanStep, snapshotNavCacheKey } from "./GridNavSnapshot.js";
import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
const MAX_CACHE = 100;
const FLOW_DONE = "flowDone";
export class FlowFieldGrid {
    constructor(cellSize, width, height, navGraph, workerUrl, hpaPathWorker = null) {
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
        this.navGraph = navGraph;
        this.hpaPathWorker = hpaPathWorker;
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
        this._topologyKey = "";
        if (!workerUrl) throw new Error("FlowFieldGrid requires an injected workerUrl");
        this._workerHost = createSabSlotWorkerHost(workerUrl, MAX_CACHE);
        this._workerHost.worker.onmessage = (e) => {
            if (e.data.type === FLOW_DONE) this._workerHost.markReady(e.data.slot, e.data.requestId);
        };
        this._workerHost.worker.postMessage({
            type: "init",
            data: { GRID_WIDTH: this.cols, GRID_SIZE: size, sabObstacle: this.sabObstacle, sabNeighbors: this.sabNeighbors, sabFlowPool: this.sabFlowPool },
        });
        this.offsetX = width / 2;
        this.offsetY = height / 2;
        this.centerX = 0;
        this.centerY = 0;
        this.cellBounds = createAabb();
    }
    invalidateLocalTopology() {
        this._topologyKey = "";
    }
    invalidateFlowSlots() {
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
        this._workerHost.invalidateSlots();
    }
    rebuildLocalObstacles(navSnapshot) {
        const size = this.cols * this.rows;
        const navCols = navSnapshot.cols;
        const navRows = navSnapshot.rows;
        const cellSize = this.cellSize;
        const half = cellSize / 2;
        const wxBase = this.centerX - this.offsetX + half;
        const wyBase = this.centerY - this.offsetY + half;
        for (let idx = 0; idx < size; idx++) {
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            const worldX = col * cellSize + wxBase;
            const worldY = row * cellSize + wyBase;
            const worldCell = snapshotWorldToGrid(navSnapshot, worldX, worldY);
            if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) {
                this.grid[idx] = snapshotIsBlocked(navSnapshot, worldCell.col, worldCell.row) ? 1 : 0;
                const base = idx * 8;
                for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
                    const { dc, dr } = OCTILE_OFFSETS[i];
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) {
                        this.neighborGrid[base + i] = -1;
                        continue;
                    }
                    const nNavCol = worldCell.col + dc;
                    const nNavRow = worldCell.row + dr;
                    if (nNavCol < 0 || nNavCol >= navCols || nNavRow < 0 || nNavRow >= navRows) {
                        this.neighborGrid[base + i] = -1;
                        continue;
                    }
                    // Backward BFS: neighbor can enter the current cell (reverse of agent flow).
                    if (!snapshotCanStep(navSnapshot, nNavCol, nNavRow, worldCell.col, worldCell.row)) {
                        this.neighborGrid[base + i] = -1;
                        continue;
                    }
                    this.neighborGrid[base + i] = nr * this.cols + nc;
                }
            } else {
                this.grid[idx] = 1;
                const base = idx * 8;
                for (let i = 0; i < 8; i++) this.neighborGrid[base + i] = -1;
            }
        }
    }
    ensureLocalTopology(navSnapshot) {
        const key = `${navSnapshot.cacheKey}:${this.centerX}:${this.centerY}`;
        if (key === this._topologyKey) return false;
        this._topologyKey = key;
        this.rebuildLocalObstacles(navSnapshot);
        this.invalidateFlowSlots();
        return true;
    }
    invalidateNavTopology() {
        this.invalidateLocalTopology();
        this.invalidateFlowSlots();
    }
    /** Uses worker-built nav snapshot view — no sync buildGridNavSnapshot on main. */
    syncLocalTopology() {
        const cacheKey = snapshotNavCacheKey(this.navGraph);
        const snapshot = this.hpaPathWorker?.getNavSnapshotView();
        if (!snapshot || snapshot.cacheKey !== cacheKey) {
            this.hpaPathWorker?.scheduleNavTopologySync(this.navGraph);
            return false;
        }
        return this.ensureLocalTopology(snapshot);
    }
    refresh() {
        this.invalidateNavTopology();
        this.hpaPathWorker?.scheduleNavTopologySync(this.navGraph);
    }
    shiftCenter(newCenterX, newCenterY) {
        this.centerX = newCenterX;
        this.centerY = newCenterY;
        this.invalidateLocalTopology();
        this.syncLocalTopology();
    }
    ensureRollTargetWindow(propX, propY, targetX, targetY, recenterThreshold) {
        const focusX = (propX + targetX) * 0.5;
        const focusY = (propY + targetY) * 0.5;
        const needsRecenter =
            !this.containsWorldPoint(propX, propY) || !this.containsWorldPoint(targetX, targetY) || Math.max(Math.abs(focusX - this.centerX), Math.abs(focusY - this.centerY)) > recenterThreshold;
        if (needsRecenter) {
            this.centerX = focusX;
            this.centerY = focusY;
            this.invalidateLocalTopology();
        }
        this.syncLocalTopology();
    }
    isFlowSlotReady(slot) {
        return this._workerHost.isReady(slot);
    }
    flowFieldView(slot) {
        const size = this.cols * this.rows;
        return new Uint8Array(this.sabFlowPool, slot * size, size);
    }
    allocateFlowSlot() {
        if (this.cacheCounter >= MAX_CACHE) this.invalidateFlowSlots();
        const slot = this.cacheCounter++;
        return slot;
    }
    postFlowRequest(slot, tx, ty, range) {
        this._workerHost.post(slot, { type: "updateFlow", tx, ty, range });
    }
    ensureFlowRequest(targetX, targetY, range = 999999) {
        const target = this.worldToGrid(targetX, targetY);
        if (target.col < 0 || target.col >= this.cols || target.row < 0 || target.row >= this.rows) return null;
        const targetIdx = target.row * this.cols + target.col;
        let slot = this.cacheLookup[targetIdx];
        if (slot === -1) {
            slot = this.allocateFlowSlot();
            this.cacheLookup[targetIdx] = slot;
            this.postFlowRequest(slot, target.col, target.row, range);
        }
        return slot;
    }
    getReadyFlowField(targetX, targetY, range = 999999) {
        const slot = this.ensureFlowRequest(targetX, targetY, range);
        if (slot === null || !this.isFlowSlotReady(slot)) return null;
        return this.flowFieldView(slot);
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
        this.invalidateLocalTopology();
        this.invalidateFlowSlots();
    }
    worldToGrid(x, y) {
        return worldToGridCentered(x, y, this.centerX, this.centerY, this.offsetX, this.offsetY, this.cellSize);
    }
    containsWorldPoint(x, y) {
        const { col, row } = this.worldToGrid(x, y);
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
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
