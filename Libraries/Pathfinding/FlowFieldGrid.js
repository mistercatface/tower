import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { gridReachabilityBfs } from "./gridReachabilityBfs.js";
import { OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { worldToGridCentered, gridToWorldCentered, getCellBoundsCenteredInto } from "../Spatial/grid/GridCoords.js";
import { snapshotGridToWorld, snapshotIsBlocked, snapshotOctileNeighborIdx, snapshotWorldToGrid, snapshotCanStep } from "./GridNavSnapshot.js";
const MAX_CACHE = 100;
export class FlowFieldGrid {
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
        this.slotRequestId = new Int32Array(MAX_CACHE);
        this.slotReadyId = new Int32Array(MAX_CACHE);
        this._topologyKey = "";
        if (!workerUrl) throw new Error("FlowFieldGrid requires an injected workerUrl");
        this.worker = new Worker(workerUrl, { type: "module" });
        this.worker.onmessage = (e) => {
            if (e.data.type === "flowDone") this.slotReadyId[e.data.slot] = e.data.requestId;
        };
        this.worker.postMessage({ type: "init", data: { GRID_WIDTH: this.cols, GRID_SIZE: size, sabObstacle: this.sabObstacle, sabNeighbors: this.sabNeighbors, sabFlowPool: this.sabFlowPool } });
        this.offsetX = width / 2;
        this.offsetY = height / 2;
        this.centerX = 0;
        this.centerY = 0;
        this.cellBounds = createAabb();
    }
    invalidateFlowSlots() {
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
        this.slotRequestId.fill(0);
        this.slotReadyId.fill(0);
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
                    const nNavCol = worldCell.col + dc;
                    const nNavRow = worldCell.row + dr;
                    if (nNavCol < 0 || nNavCol >= navCols || nNavRow < 0 || nNavRow >= navRows) {
                        this.neighborGrid[base + i] = -1;
                        continue;
                    }
                    // For the backward BFS flow field, we need the reverse transition:
                    // we can visit the neighbor from the current cell only if the neighbor can step to the current cell.
                    if (!snapshotCanStep(navSnapshot, nNavCol, nNavRow, worldCell.col, worldCell.row)) {
                        this.neighborGrid[base + i] = -1;
                        continue;
                    }
                    const nWorld = snapshotGridToWorld(navSnapshot, nNavCol, nNavRow);
                    const localN = worldToGridCentered(nWorld.x, nWorld.y, this.centerX, this.centerY, this.offsetX, this.offsetY, cellSize);
                    if (localN.col >= 0 && localN.col < this.cols && localN.row >= 0 && localN.row < this.rows) this.neighborGrid[base + i] = localN.row * this.cols + localN.col;
                    else this.neighborGrid[base + i] = -1;
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
    refresh() {
        this._topologyKey = "";
        this.ensureLocalTopology(this.navGraph.ensureGridNavSnapshot());
    }
    shiftCenter(newCenterX, newCenterY) {
        this.centerX = newCenterX;
        this.centerY = newCenterY;
        this.refresh();
    }
    ensureRollTargetWindow(propX, propY, targetX, targetY, recenterThreshold) {
        const focusX = (propX + targetX) * 0.5;
        const focusY = (propY + targetY) * 0.5;
        const needsRecenter =
            !this.containsWorldPoint(propX, propY) || !this.containsWorldPoint(targetX, targetY) || Math.max(Math.abs(focusX - this.centerX), Math.abs(focusY - this.centerY)) > recenterThreshold;
        if (needsRecenter) {
            this.centerX = focusX;
            this.centerY = focusY;
            this._topologyKey = "";
        }
        this.ensureLocalTopology(this.navGraph.ensureGridNavSnapshot());
    }
    isFlowSlotReady(slot) {
        const requestId = this.slotRequestId[slot];
        return requestId > 0 && this.slotReadyId[slot] === requestId;
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
        let requestId = (this.slotRequestId[slot] + 1) | 0;
        if (requestId === 0) requestId = 1;
        this.slotRequestId[slot] = requestId;
        this.worker.postMessage({ type: "updateFlow", slot, requestId, tx, ty, range });
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
        this._topologyKey = "";
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
