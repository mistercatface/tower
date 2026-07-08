import { FlatGridSearch, SearchState, createNavSimView, bindNavSimEdgePool, bindNavSimGridFrame, createNavLocalView, navTopologyFromSab, bakeNavTopologyIntoArena, buildNavComponentMap, buildNavReachableMaskFromSeed } from "./navigation.js";
import { bindNavEdgePoolFromSab } from "../Spatial/spatial.js";
import { hpaPathSlotIdx, hpaPathSlotMeta } from "./hpaWorkerSab.js";
export class HpaBufferManager {
    constructor() {
        this.maxSlots = 0;
        this.maxPathLen = 0;
        this.maxAbstractLen = 0;
        this.sabPathMetaPool = null;
        this.sabPathIdxPool = null;
        this.sabAbstractIdxPool = null;
    }
    init(data) {
        this.maxSlots = data.maxSlots;
        this.maxPathLen = data.maxPathLen;
        this.maxAbstractLen = data.maxAbstractLen;
        this.sabPathMetaPool = data.sabPathMetaPool;
        this.sabPathIdxPool = data.sabPathIdxPool;
        this.sabAbstractIdxPool = data.sabAbstractIdxPool;
    }
    writeCellPath(slot, pathScratch, len) {
        const pathMeta = hpaPathSlotMeta(this.sabPathMetaPool, slot);
        pathMeta[0] = len;
        if (len === 0) return;
        const pathIdx = hpaPathSlotIdx(this.sabPathIdxPool, slot, this.maxPathLen);
        pathIdx.set(pathScratch.subarray(0, len));
    }
    writeAbstractPath(slot, pathIdx) {
        const pathMeta = hpaPathSlotMeta(this.sabPathMetaPool, slot);
        pathMeta[1] = pathIdx ? pathIdx.length : 0;
    }
    buildReplanResult(slot) {
        const pathLen = hpaPathSlotMeta(this.sabPathMetaPool, slot)[0];
        return pathLen > 0 ? { pathLen } : null;
    }
}
export class HpaTopologyArena {
    constructor() {
        this.gridFrame = null;
        this.navTopology = null;
        this.navView = null;
        this.navSimView = null;
        this.navArenaBound = false;
        this.sabEdgePool = null;
        this.edgePoolCount = 0;
        this.cardinalOpen = null;
        this.vertexPassability = null;
        this.activePortalPairs = null;
        this.activePortalCount = null;
        this.floorPacked = null;
        this.navCacheKey = "";
    }
    requireGridFrame() {
        if (!this.gridFrame) throw new Error("HPA worker missing grid frame");
        return this.gridFrame;
    }
    assertFrameKey(gridFrameKey) {
        if (gridFrameKey !== this.requireGridFrame().key) throw new Error(`HPA grid frame mismatch: worker ${this.gridFrame.key}, request ${gridFrameKey ?? ""}`);
    }
    syncGridFrame(frame) {
        if (this.gridFrame?.key === frame.key) {
            if (this.gridFrame.cols !== frame.cols || this.gridFrame.rows !== frame.rows) throw new Error("nav sync grid size mismatch for unchanged frame key");
            this.gridFrame = frame;
            if (this.navSimView) bindNavSimGridFrame(this.navSimView, frame);
            return;
        }
        const sizeChanged = !this.gridFrame || this.gridFrame.cols !== frame.cols || this.gridFrame.rows !== frame.rows;
        this.gridFrame = frame;
        if (sizeChanged) {
            this.navSimView = null;
            this.navTopology = null;
            this.navCacheKey = "";
            this.navArenaBound = false;
        } else if (this.navSimView) bindNavSimGridFrame(this.navSimView, frame);
    }
    bindArena(data) {
        this.syncGridFrame(data.gridFrame);
        this.sabEdgePool = data.sabEdgePool;
        this.edgePoolCount = data.edgePoolCount;
        const gridFill = new Uint8Array(data.sabGridFill);
        const floorPacked = new Uint8Array(data.sabFloorPacked);
        const activePortalPairs = new Int32Array(data.sabActivePortalPairs);
        const activePortalCount = new Int32Array(data.sabActivePortalCount);
        const edgeSlots = new Int32Array(data.sabEdgeSlots);
        this.cardinalOpen = new Uint8Array(data.sabCardinalOpen);
        this.vertexPassability = new Uint8Array(data.sabVertexPassability);
        const edgePool = bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount);
        this.navSimView = createNavSimView(this.gridFrame, gridFill, floorPacked, edgeSlots, edgePool, this.vertexPassability, activePortalPairs, activePortalCount);
        this.activePortalPairs = activePortalPairs;
        this.activePortalCount = activePortalCount;
        this.floorPacked = floorPacked;
        this.navTopology = navTopologyFromSab(data.sabBlocked, data.sabOctileNeighbors, data.sabOctilePredecessors);
        this.navView = createNavLocalView(this.requireGridFrame(), this.navTopology);
        this.navArenaBound = true;
    }
    syncNavSimEdgePool() {
        bindNavSimEdgePool(this.navSimView, bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount));
    }
    requireNavSimBake() {
        if (!this.navArenaBound || !this.navSimView) throw new Error("HPA worker nav arena not bound");
        return { simView: this.navSimView, cardinalOpen: this.cardinalOpen, vertexPassability: this.vertexPassability };
    }
    requireNavTopology() {
        if (!this.navTopology) throw new Error("HPA worker missing nav topology");
        return this.navTopology;
    }
    bakeNavTopology(damageBounds) {
        this.requireGridFrame();
        const baked = this.requireNavSimBake();
        const topology = this.requireNavTopology();
        bakeNavTopologyIntoArena(baked.simView, topology, baked.cardinalOpen, baked.vertexPassability, damageBounds);
        return baked;
    }
    buildNavTopologyOnWorker(data) {
        if (data.rebindArena) this.bindArena(data);
        else {
            if (!this.navArenaBound) throw new Error("buildNavTopology requires bound nav arena");
            this.syncGridFrame(data.gridFrame);
            if (data.edgePoolCount !== this.edgePoolCount) {
                this.edgePoolCount = data.edgePoolCount;
                this.syncNavSimEdgePool();
            }
        }
        this.navCacheKey = data.navCacheKey;
        this.bakeNavTopology(data.damageBounds ?? null);
    }
}
export class HpaReplanContext {
    constructor({ frame, topology, activePortalPairs, activePortalCount }) {
        this.frame = frame;
        this.topology = topology;
        this.activePortalPairs = activePortalPairs;
        this.activePortalCount = activePortalCount;
    }
}
export class HpaReplanPlanner {
    constructor(buffers, searchState) {
        this.buffers = buffers;
        this.searchState = searchState;
        this.gridSearch = new FlatGridSearch(this.searchState);
        this.localPathScratch = new Int32Array(this.buffers.maxPathLen);
    }
    ensureScratchBuffers(cols, rows) {
        if (this.localPathScratch.length < this.buffers.maxPathLen) this.localPathScratch = new Int32Array(this.buffers.maxPathLen);
    }
    run(slot, context, data) {
        const startIdx = data.startIdx;
        const targetIdx = data.targetIdx;
        const cols = context.frame.cols;
        const rows = context.frame.rows;
        this.searchState.resize(cols * rows);
        this.ensureScratchBuffers(cols, rows);
        this.gridSearch.neighbors = context.topology.octileNeighbors;
        this.gridSearch.cols = cols;
        const portalCount = context.activePortalCount ? context.activePortalCount[0] : 0;
        const mask = buildNavReachableMaskFromSeed(context.topology.blocked, context.topology.octileNeighbors, cols, rows, startIdx, context.activePortalPairs, context.activePortalCount);
        if (startIdx !== targetIdx && !mask[targetIdx]) {
            this.buffers.writeCellPath(slot, this.localPathScratch, 0);
            this.buffers.writeAbstractPath(slot, null);
            return this.buffers.buildReplanResult(slot);
        }
        const len = this.gridSearch.localPortal(startIdx, targetIdx, this.buffers.maxPathLen, this.localPathScratch, context.topology.blocked, context.activePortalPairs, portalCount);
        this.buffers.writeCellPath(slot, this.localPathScratch, len);
        this.buffers.writeAbstractPath(slot, null);
        return this.buffers.buildReplanResult(slot);
    }
}
export class HpaPathfindingWorker {
    constructor() {
        this.buffers = new HpaBufferManager();
        this.topology = new HpaTopologyArena();
        this.searchState = null;
        this.planner = null;
    }
    applyPathSabFromMessage(data) {
        if (!data.maxPathLen || data.maxPathLen <= this.buffers.maxPathLen) return;
        this.buffers.sabPathIdxPool = data.sabPathIdxPool;
        this.buffers.maxPathLen = data.maxPathLen;
        this.planner.localPathScratch = new Int32Array(this.buffers.maxPathLen);
    }
    runReplan(slot, data) {
        const frame = this.topology.requireGridFrame();
        const context = new HpaReplanContext({ frame, topology: this.topology.requireNavTopology(), activePortalPairs: this.topology.activePortalPairs, activePortalCount: this.topology.activePortalCount });
        return this.planner.run(slot, context, data);
    }
    onMessage(e) {
        const { type, slot, requestId } = e.data;
        if (type === "init") {
            const data = e.data.data;
            this.buffers.init(data);
            const size = data.maxGraphNodes || 4096;
            this.searchState = new SearchState(size + 2);
            this.planner = new HpaReplanPlanner(this.buffers, this.searchState);
            return;
        }
        if (type === "growPathSab") {
            this.applyPathSabFromMessage(e.data);
            self.postMessage({ type: "growPathSabDone" });
            return;
        }
        if (type === "buildNavTopology") {
            this.topology.buildNavTopologyOnWorker(e.data);
            const size = this.topology.requireGridFrame().cols * this.topology.requireGridFrame().rows;
            const searchStateSize = Math.max(size, (this.buffers.maxGraphNodes || 4096) + 2);
            this.searchState.resize(searchStateSize);
            self.postMessage({ type: "syncNavDone" });
            return;
        }
        if (type === "replan") {
            this.applyPathSabFromMessage(e.data);
            const replanResult = this.runReplan(slot, e.data);
            self.postMessage({ type: "hpaDone", slot, requestId, replanResult });
        }
    }
}
if (typeof self !== "undefined") {
    const worker = new HpaPathfindingWorker();
    self.onmessage = (e) => worker.onMessage(e);
}
