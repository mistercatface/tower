import { gridNavCacheKey, isNavTopologyReady } from "../Spatial/grid/gridNavEpoch.js";
import { createSabSlotWorkerHost } from "../Workers/SabSlotWorkerHost.js";
import { FlowFieldWindow } from "./flowFieldWindow.js";
const MAX_CACHE = 100;
const FLOW_DONE = "flowDone";
const FLOW_WINDOW_DONE = "flowWindowDone";
class FlowFieldWorkerProtocol {
    constructor(workerUrl, owner, initData) {
        this.owner = owner;
        this.host = createSabSlotWorkerHost(workerUrl, MAX_CACHE);
        this.bindWorkerHandlers();
        this.postInit(initData);
    }
    bindWorkerHandlers() {
        this.host.worker.onmessage = (e) => this.owner._handleWorkerMessage(e.data);
        this.host.worker.onerror = (err) => console.error("FlowFieldGrid error:", err.message);
    }
    postInit(initData) {
        this.postMessage({ type: "init", data: initData });
    }
    postMessage(message) {
        this.host.worker.postMessage(message);
    }
    postSlot(slot, payload) {
        return this.host.post(slot, payload);
    }
    markReady(slot, requestId) {
        this.host.markReady(slot, requestId);
    }
    isReady(slot) {
        return this.host.isReady(slot);
    }
    invalidateSlots() {
        this.host.invalidateSlots();
    }
    shutdown() {
        this.invalidateSlots();
        this.host.worker.onmessage = null;
        this.host.worker.onerror = null;
    }
}
export class FlowFieldGrid {
    constructor(cellSize, width, height, navGraph, workerUrl, hpaPathWorker = null) {
        this.window = new FlowFieldWindow(cellSize, width, height);
        this.frame = this.window.frame;
        this.cellSize = this.window.cellSize;
        this.width = this.window.width;
        this.height = this.window.height;
        this.navGraph = navGraph;
        this.hpaPathWorker = hpaPathWorker;
        this.cols = this.window.cols;
        this.rows = this.window.rows;
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
        this._windowReady = false;
        this._flowNavBound = false;
        this._flowNavBoundSize = 0;
        this._navBlockedView = null;
        if (!workerUrl) throw new Error("FlowFieldGrid requires an injected workerUrl");
        this.protocol = new FlowFieldWorkerProtocol(workerUrl, this, {
            GRID_WIDTH: this.cols,
            GRID_SIZE: size,
            sabFlowToNav: this.sabFlowToNav,
            sabNeighbors: this.sabNeighbors,
            sabFlowPool: this.sabFlowPool,
        });
        this._workerHost = this.protocol.host;
        this._syncWindowAliases();
    }
    _syncWindowAliases() {
        this.frame = this.window.frame;
        this.cellSize = this.window.cellSize;
        this.width = this.window.width;
        this.height = this.window.height;
        this.cols = this.window.cols;
        this.rows = this.window.rows;
        this.offsetX = this.frame.offsetX;
        this.offsetY = this.frame.offsetY;
        this.centerX = this.frame.centerX;
        this.centerY = this.frame.centerY;
        this.navCols = this.window.navCols;
        this.navRows = this.window.navRows;
        this._topologyKey = this.window.topologyKey;
        this._windowReady = this.window.ready;
        this.cellBounds = this.window.cellBounds;
    }
    _handleWorkerMessage(data) {
        if (data.type === FLOW_DONE) {
            this.protocol.markReady(data.slot, data.requestId);
            return;
        }
        if (data.type === FLOW_WINDOW_DONE) this._onFlowWindowDone();
    }
    _setCenter(centerX, centerY) {
        this.window.setCenter(centerX, centerY);
        this._syncWindowAliases();
    }
    invalidateLocalTopology() {
        this.window.invalidateTopology();
        this._syncWindowAliases();
    }
    invalidateFlowSlots() {
        this.cacheLookup.fill(-1);
        this.cacheCounter = 0;
        this.protocol.invalidateSlots();
    }
    _onFlowWindowDone() {
        this.window.markReady();
        this._syncWindowAliases();
        this.invalidateFlowSlots();
        this._windowSyncResolve?.();
        this._windowSyncResolve = null;
        this._windowSyncPromise = null;
    }
    _bindFlowNavArena(navFrame) {
        const navSize = navFrame.cols * navFrame.rows;
        const rebind = !this._flowNavBound || this._flowNavBoundSize !== navSize;
        if (rebind) {
            const sabBlocked = this.hpaPathWorker.getNavBlockedSab();
            const sabOctilePredecessors = this.hpaPathWorker.getNavOctilePredecessorsSab();
            this.protocol.postMessage({ type: "bindFlowNavArena", data: { sabBlocked, sabOctilePredecessors, navCols: navFrame.cols, navRows: navFrame.rows } });
            this._navBlockedView = new Uint8Array(sabBlocked);
            this._flowNavBound = true;
            this._flowNavBoundSize = navSize;
        }
    }
    _postFlowWindowSync() {
        this.window.ready = false;
        this._syncWindowAliases();
        this._windowSyncGen = (this._windowSyncGen ?? 0) + 1;
        const gen = this._windowSyncGen;
        this._windowSyncPromise = new Promise((resolve) => {
            this._windowSyncResolve = () => {
                if (this._windowSyncGen === gen) resolve();
            };
        });
        this.protocol.postMessage({ type: "syncFlowWindow" });
    }
    rebuildFlowToNavMap(navFrame) {
        this.window.rebuildFlowToNavMap(this.flowToNavIdx, navFrame);
        this._syncWindowAliases();
    }
    isFlowCellBlocked(flowIdx) {
        return this.window.isFlowCellBlocked(this.flowToNavIdx, this._navBlockedView, flowIdx);
    }
    ensureLocalTopology(navCacheKey, navFrame) {
        if (!this.window.beginTopologySync(navCacheKey)) return false;
        this._syncWindowAliases();
        this.rebuildFlowToNavMap(navFrame);
        this._bindFlowNavArena(navFrame);
        this._postFlowWindowSync();
        return true;
    }
    invalidateNavTopology() {
        this.invalidateLocalTopology();
        this.invalidateFlowSlots();
        this._flowNavBound = false;
        this._flowNavBoundSize = 0;
        this._navBlockedView = null;
    }
    /** Nav topology must already be synced via NavRuntime — never schedules worker nav here. */
    syncLocalTopology() {
        const cacheKey = gridNavCacheKey(this.navGraph);
        const navFrame = this.hpaPathWorker?.getGridFrame();
        if (!navFrame || !isNavTopologyReady(this.hpaPathWorker, this.navGraph)) return false;
        return this.ensureLocalTopology(cacheKey, navFrame);
    }
    refresh() {
        this.invalidateNavTopology();
    }
    shiftCenter(newCenterX, newCenterY) {
        this._setCenter(newCenterX, newCenterY);
        this.invalidateLocalTopology();
        this.syncLocalTopology();
    }
    ensureRollTargetWindow(propX, propY, targetX, targetY, recenterThreshold) {
        const focusX = (propX + targetX) * 0.5;
        const focusY = (propY + targetY) * 0.5;
        const needsRecenter =
            !this.containsWorldPoint(propX, propY) || !this.containsWorldPoint(targetX, targetY) || Math.max(Math.abs(focusX - this.centerX), Math.abs(focusY - this.centerY)) > recenterThreshold;
        if (needsRecenter) {
            this._setCenter(focusX, focusY);
            this.invalidateLocalTopology();
        }
        this.syncLocalTopology();
    }
    isFlowSlotReady(slot) {
        return this.protocol.isReady(slot);
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
        this.protocol.postSlot(slot, { type: "updateFlow", tx, ty, range });
    }
    ensureFlowRequest(targetX, targetY, range = 999999) {
        if (!this.window.ready) return null;
        const request = this.window.flowRequest(targetX, targetY, range);
        if (!request) return null;
        let slot = this.cacheLookup[request.targetIdx];
        if (slot === -1) {
            slot = this.allocateFlowSlot();
            this.cacheLookup[request.targetIdx] = slot;
            this.protocol.postSlot(slot, request.toWorkerPayload());
        }
        return slot;
    }
    getReadyFlowField(targetX, targetY, range = 999999) {
        this.syncLocalTopology();
        if (!this.window.ready) return null;
        const slot = this.ensureFlowRequest(targetX, targetY, range);
        if (slot === null || !this.isFlowSlotReady(slot)) return null;
        return this.flowFieldView(slot);
    }
    checkReachability(startX, startY, targetX, targetY) {
        return this.window.checkReachability(this.flowToNavIdx, this._navBlockedView, this.neighborGrid, startX, startY, targetX, targetY);
    }
    clear() {
        this.flowToNavIdx.fill(-1);
        this.neighborGrid.fill(-1);
        this.invalidateNavTopology();
        this.invalidateFlowSlots();
    }
    worldToGrid(x, y) {
        return this.window.worldToGrid(x, y);
    }
    containsWorldPoint(x, y) {
        return this.window.containsWorldPoint(x, y);
    }
    gridToWorld(col, row) {
        return this.window.gridToWorld(col, row);
    }
    getCellBounds(col, row) {
        return this.window.getCellBounds(col, row);
    }
    entityIntersectsCell(x, y, radius, col, row) {
        return this.window.entityIntersectsCell(x, y, radius, col, row);
    }
}
