import { circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
import { gridReachabilityBfs } from "./gridReachabilityBfs.js";
import { worldToGridCentered, gridToWorldCentered, getCellBoundsCenteredInto } from "../Spatial/grid/GridCoords.js";
import { snapshotWorldToGrid } from "./GridNavSnapshot.js";
import { gridNavCacheKey } from "../Spatial/grid/gridNavEpoch.js";
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
        this.sabFlowToNav = new SharedArrayBuffer(size * 4);
        this.flowToNavIdx = new Int32Array(this.sabFlowToNav).fill(-1);
        this.navCols = 0;
        this.navRows = 0;
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
            data: { GRID_WIDTH: this.cols, GRID_SIZE: size, sabFlowToNav: this.sabFlowToNav, sabNeighbors: this.sabNeighbors, sabFlowPool: this.sabFlowPool },
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
    bindNavSabToWorker() {
        const sabBlocked = this.hpaPathWorker?.getNavBlockedSab();
        if (!sabBlocked) return;
        this._workerHost.worker.postMessage({ type: "bindNavSab", data: { sabNavBlocked: sabBlocked } });
    }
    rebuildLocalFlowNavMap(navFrame, navTopology) {
        const size = this.cols * this.rows;
        const navCols = navFrame.cols;
        const navRows = navFrame.rows;
        this.navCols = navCols;
        this.navRows = navRows;
        const navToFlow = new Int32Array(navCols * navRows).fill(-1);
        const cellSize = this.cellSize;
        const half = cellSize / 2;
        const wxBase = this.centerX - this.offsetX + half;
        const wyBase = this.centerY - this.offsetY + half;
        for (let idx = 0; idx < size; idx++) {
            const col = idx % this.cols;
            const row = (idx / this.cols) | 0;
            const worldX = col * cellSize + wxBase;
            const worldY = row * cellSize + wyBase;
            const worldCell = snapshotWorldToGrid(navFrame, worldX, worldY);
            if (worldCell.col >= 0 && worldCell.col < navCols && worldCell.row >= 0 && worldCell.row < navRows) {
                const navIdx = worldCell.row * navCols + worldCell.col;
                this.flowToNavIdx[idx] = navIdx;
                navToFlow[navIdx] = idx;
            } else this.flowToNavIdx[idx] = -1;
        }
        const { octileNeighbors } = navTopology;
        for (let idx = 0; idx < size; idx++) {
            const navIdx = this.flowToNavIdx[idx];
            const base = idx * 8;
            if (navIdx < 0) {
                for (let i = 0; i < 8; i++) this.neighborGrid[base + i] = -1;
                continue;
            }
            const navBase = navIdx * 8;
            for (let i = 0; i < 8; i++) {
                const navNIdx = octileNeighbors[navBase + i];
                this.neighborGrid[base + i] = navNIdx >= 0 ? navToFlow[navNIdx] : -1;
            }
        }
    }
    isFlowCellBlocked(flowIdx) {
        const navIdx = this.flowToNavIdx[flowIdx];
        if (navIdx < 0) return true;
        const topology = this.hpaPathWorker?.getNavTopology();
        return !topology || topology.blocked[navIdx] !== 0;
    }
    ensureLocalTopology(navCacheKey, navFrame, navTopology) {
        const key = `${navCacheKey}:${this.centerX}:${this.centerY}`;
        if (key === this._topologyKey) return false;
        this._topologyKey = key;
        this.rebuildLocalFlowNavMap(navFrame, navTopology);
        this.bindNavSabToWorker();
        this.invalidateFlowSlots();
        return true;
    }
    invalidateNavTopology() {
        this.invalidateLocalTopology();
        this.invalidateFlowSlots();
    }
    /** Nav topology must already be synced via NavigationService — never schedules worker nav here. */
    syncLocalTopology() {
        const cacheKey = gridNavCacheKey(this.navGraph);
        const navFrame = this.hpaPathWorker?.getGridFrame();
        const navTopology = this.hpaPathWorker?.getNavTopology();
        if (!navFrame || !navTopology || this.navGraph.gridNavCacheKey !== cacheKey) return false;
        return this.ensureLocalTopology(cacheKey, navFrame, navTopology);
    }
    refresh() {
        this.invalidateNavTopology();
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
        if (!this._topologyKey) return null;
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
        this.syncLocalTopology();
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
        return gridReachabilityBfs(startIdx, targetIdx, (idx) => this.isFlowCellBlocked(idx), this.neighborGrid);
    }
    clear() {
        this.flowToNavIdx.fill(-1);
        this.neighborGrid.fill(-1);
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
