import { FlatAbstractGraphSearch, FlatGridSearch, SearchState, createNavSimView, bindNavSimEdgePool, bindNavSimGridFrame, HpaAbstractGraph, prepareHpaReplanPrep, buildFullRegionGraph, packRegionGraphFlat, rebuildDamagedRegionGraph, createNavLocalView, navTopologyFromSab, bakeNavTopologyIntoArena } from "../../Navigation/navigation.js";
import { PortalNavGraph } from "../../Spatial/portals.js";
import { bindNavEdgePoolFromSab } from "../../Spatial/spatial.js";
import { hpaPathSlotAbstractIdx, hpaPathSlotIdx, hpaPathSlotMeta, PersistedHpaGraphWriter, stitchAbstractCellPath } from "../../Pathfinding/hpaWorkerSab.js";
import { packCellKey, KEY_STRIDE } from "../../Spatial/spatial.js";
export class HpaBufferManager {
    constructor() {
        this.maxSlots = 0;
        this.maxPathLen = 0;
        this.maxAbstractLen = 0;
        this.maxGraphNodes = 0;
        this.maxGraphEdges = 0;
        this.maxCellsPerChunk = 0;
        this.minCellsPerChunk = 0;
        this.sabPathMetaPool = null;
        this.sabPathIdxPool = null;
        this.sabAbstractIdxPool = null;
        this.sabPersistGraphNodeIdx = null;
        this.sabPersistGraphEdgeOffsets = null;
        this.sabPersistGraphEdgeTargets = null;
        this.sabPersistGraphEdgeCosts = null;
        this.sabPersistGraphEdgeSources = null;
        this.sabCellToRegionIdx = null;
    }
    init(data) {
        this.maxSlots = data.maxSlots;
        this.maxPathLen = data.maxPathLen;
        this.maxAbstractLen = data.maxAbstractLen;
        this.maxGraphNodes = data.maxGraphNodes;
        this.maxGraphEdges = data.maxGraphEdges;
        this.maxCellsPerChunk = data.maxCellsPerChunk;
        this.minCellsPerChunk = data.minCellsPerChunk;
        this.sabPathMetaPool = data.sabPathMetaPool;
        this.sabPathIdxPool = data.sabPathIdxPool;
        this.sabAbstractIdxPool = data.sabAbstractIdxPool;
        this.sabPersistGraphNodeIdx = data.sabPersistGraphNodeIdx;
        this.sabPersistGraphEdgeOffsets = data.sabPersistGraphEdgeOffsets;
        this.sabPersistGraphEdgeTargets = data.sabPersistGraphEdgeTargets;
        this.sabPersistGraphEdgeCosts = data.sabPersistGraphEdgeCosts;
        this.sabPersistGraphEdgeSources = data.sabPersistGraphEdgeSources;
        this.sabCellToRegionIdx = data.sabCellToRegionIdx;
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
        if (!pathIdx) return;
        const abstractIdx = hpaPathSlotAbstractIdx(this.sabAbstractIdxPool, slot, this.maxAbstractLen);
        for (let i = 0; i < pathIdx.length; i++) abstractIdx[i] = pathIdx[i];
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
        this.portalTargetIdx = null;
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
    bindArena(data, maxGraphNodes) {
        this.syncGridFrame(data.gridFrame);
        this.sabEdgePool = data.sabEdgePool;
        this.edgePoolCount = data.edgePoolCount;
        const gridFill = new Uint8Array(data.sabGridFill);
        const floorPacked = new Uint8Array(data.sabFloorPacked);
        const portalTargetIdx = new Int32Array(data.sabPortalTargetIdx);
        const edgeSlots = new Int32Array(data.sabEdgeSlots);
        this.cardinalOpen = new Uint8Array(data.sabCardinalOpen);
        this.vertexPassability = new Uint8Array(data.sabVertexPassability);
        const edgePool = bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount);
        this.navSimView = createNavSimView(this.gridFrame, gridFill, floorPacked, edgeSlots, edgePool, this.vertexPassability, portalTargetIdx);
        this.portalTargetIdx = portalTargetIdx;
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
export class HpaRegionGraphManager {
    constructor(buffers) {
        this.buffers = buffers;
        this.persistedGraph = new PersistedHpaGraphWriter(buffers);
        this.regionGraphState = null;
        this.persistNodeCount = 0;
        this.persistEdgeWrite = 0;
        /** @type {string[]} */
        this.persistNodeIds = [];
    }
    writeRegionGraphToSab(gridFrame) {
        if (!this.regionGraphState) return null;
        const frame = gridFrame;
        const packed = packRegionGraphFlat(this.regionGraphState.graph ?? this.regionGraphState.nodesMap, this.regionGraphState.cellToNode, frame);
        const meta = this.persistedGraph.writePackedRegionGraph(packed, frame);
        this.persistNodeCount = meta.nodeCount;
        this.persistEdgeWrite = meta.edgeWrite;
        this.persistNodeIds = meta.nodeIds;
        return meta;
    }
    abstractGraph() {
        const graph = this.persistedGraph.flatGraphView();
        return new HpaAbstractGraph(graph.nodeIdx, graph.cols, graph.edgeOffsets, graph.edgeTargets, graph.edgeCosts, graph.nodeCount, graph.edgeWrite, graph.nodeIds);
    }
    buildRegionGraphFull(gridFrame, topology, navView, data) {
        const frame = gridFrame;
        const portalTargetIdx = data.portalTargetIdx ?? null;
        const built = buildFullRegionGraph({ blocked: topology.blocked, frame, navGraph: navView, maxCellsPerChunk: this.buffers.maxCellsPerChunk, minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk, portalTargetIdx });
        this.regionGraphState = { ...built, maxCellsPerChunk: this.buffers.maxCellsPerChunk, minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk, damagePadding: data.damagePadding, distToWall: null };
        return this.writeRegionGraphToSab(gridFrame);
    }
    patchRegionGraph(gridFrame, topology, navView, data) {
        if (!this.regionGraphState) return this.buildRegionGraphFull(gridFrame, topology, navView, data);
        rebuildDamagedRegionGraph(this.regionGraphState, data.bounds, gridFrame, topology.blocked, navView, data.portalTargetIdx ?? null);
        return this.writeRegionGraphToSab(gridFrame);
    }
}
export class HpaReplanContext {
    constructor({ frame, topology, navView, graph, cellToRegion, portalTargetIdx }) {
        this.frame = frame;
        this.topology = topology;
        this.navView = navView;
        this.graph = graph;
        this.cellToRegion = cellToRegion;
        this.portalTargetIdx = portalTargetIdx;
    }
}
export class HpaReplanPlanner {
    constructor(buffers, searchState) {
        this.buffers = buffers;
        this.searchState = searchState;
        this.tempLegsBuffer = new Int32Array(buffers.maxPathLen);
        this.tempLegsOffsets = new Map();
        this.tempLegsLengths = new Map();
        this.gridSearch = new FlatGridSearch(this.searchState);
        this.localPathScratch = new Int32Array(this.buffers.maxPathLen);
        this.portalLegScratch = new Int32Array(this.buffers.maxPathLen);
        this.portalHopScratch = new Int32Array(2);
        this.portalLinkPairs = new Int32Array(8);
        this.portalLinkCount = 0;
        this.abstractPathScratch = new Int32Array(this.buffers.maxAbstractLen);
        this.abstractPathList = [];
    }
    ensureScratchBuffers(cols, rows) {
        const stitchedMax = cols * rows;
        if (this.localPathScratch.length < this.buffers.maxPathLen) this.localPathScratch = new Int32Array(this.buffers.maxPathLen);
        if (this.portalLegScratch.length < this.buffers.maxPathLen) this.portalLegScratch = new Int32Array(this.buffers.maxPathLen);
        if (this.tempLegsBuffer.length < stitchedMax) this.tempLegsBuffer = new Int32Array(stitchedMax);
    }
    syncPortalLinkPairs(portalTargetIdx) {
        if (!portalTargetIdx) {
            this.portalLinkCount = 0;
            return;
        }
        const collected = PortalNavGraph.collectActiveLinks(portalTargetIdx, this.portalLinkPairs);
        this.portalLinkPairs = collected.pairs;
        this.portalLinkCount = collected.count;
    }
    run(slot, context, data) {
        const startIdx = data.startIdx;
        const targetIdx = data.targetIdx;
        const cols = context.frame.cols;
        const rows = context.frame.rows;
        this.ensureScratchBuffers(cols, rows);
        this.gridSearch.neighbors = context.topology.octileNeighbors;
        this.gridSearch.cols = cols;
        this.syncPortalLinkPairs(context.portalTargetIdx);
        const prep = prepareHpaReplanPrep(cols, rows, context.cellToRegion, context.graph, startIdx, targetIdx);
        if (prep.mode === "local") return this.writeLocalResult(slot, this.gridSearch, prep, startIdx, targetIdx);
        return this.writeHpaResult(slot, this.gridSearch, context.graph, prep, startIdx, targetIdx, cols, rows, context);
    }
    writeLocalResult(slot, gridSearch, prep, startIdx, targetIdx) {
        const len = gridSearch.local(startIdx, targetIdx, prep.legMaxCost, this.localPathScratch);
        if (len === 0) {
            this.buffers.writeCellPath(slot, this.localPathScratch, 0);
            this.buffers.writeAbstractPath(slot, null);
            return this.buffers.buildReplanResult(slot);
        }
        this.buffers.writeCellPath(slot, this.localPathScratch, len);
        this.buffers.writeAbstractPath(slot, null);
        return this.buffers.buildReplanResult(slot);
    }
    writeHpaResult(slot, gridSearch, baseGraph, prep, startIdx, targetIdx, cols, rows, context) {
        this.tempLegsOffsets.clear();
        this.tempLegsLengths.clear();
        const { extendedGraph, startTemp, targetTemp } = baseGraph.buildExtended(startIdx, targetIdx, cols, prep, this.buffers.maxCellsPerChunk, (lStartIdx, lTargetIdx, legKey, offset) => {
            const len = gridSearch.local(lStartIdx, lTargetIdx, prep.legMaxCost, this.tempLegsBuffer.subarray(offset));
            if (len === 0) return 0;
            this.tempLegsOffsets.set(legKey, offset);
            this.tempLegsLengths.set(legKey, len);
            return len;
        });
        const abstractSearch = new FlatAbstractGraphSearch({ graph: extendedGraph, searchState: this.searchState });
        const abstractLen = abstractSearch.run(startTemp, targetTemp, this.abstractPathScratch);
        if (abstractLen === 0) {
            this.buffers.writeAbstractPath(slot, null);
            this.buffers.writeCellPath(slot, this.localPathScratch, 0);
            return this.buffers.buildReplanResult(slot);
        }
        const abstractPath = this.abstractPathList;
        abstractPath.length = abstractLen;
        for (let i = 0; i < abstractLen; i++) abstractPath[i] = this.abstractPathScratch[i];
        this.buffers.writeAbstractPath(slot, abstractPath);
        const pathIdx = hpaPathSlotIdx(this.buffers.sabPathIdxPool, slot, this.buffers.maxPathLen);
        const resolveFn = (aIdx, bIdx) => this.resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx, cols, context.cellToRegion);
        resolveFn.scratch = this.localPathScratch;
        const pathLen = stitchAbstractCellPath(abstractPath, prep, this.tempLegsBuffer, this.tempLegsOffsets, this.tempLegsLengths, resolveFn, pathIdx, this.buffers.maxPathLen);
        const pathMeta = hpaPathSlotMeta(this.buffers.sabPathMetaPool, slot);
        pathMeta[0] = pathLen;
        return this.buffers.buildReplanResult(slot);
    }
    resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx, cols, cellToRegion) {
        const repA = baseGraph.nodeIdx[aIdx];
        const repB = baseGraph.nodeIdx[bIdx];
        const len = gridSearch.local(repA, repB, prep.legMaxCost, this.localPathScratch);
        if (len > 0) return len;
        if (!cellToRegion || this.portalLinkCount === 0) return 0;
        const hopLen = PortalNavGraph.findLegBetweenRegions(cellToRegion, this.portalLinkPairs, this.portalLinkCount, aIdx, bIdx, this.portalHopScratch);
        if (hopLen === 0) return 0;
        const exitIdx = this.portalHopScratch[0];
        const entryIdx = this.portalHopScratch[1];
        const seg1 = gridSearch.local(repA, exitIdx, prep.legMaxCost, this.localPathScratch);
        if (seg1 === 0) return 0;
        const seg2 = gridSearch.local(entryIdx, repB, prep.legMaxCost, this.portalLegScratch);
        if (seg2 === 0) return 0;
        for (let i = 0; i < seg2; i++) this.localPathScratch[seg1 + i] = this.portalLegScratch[i];
        return seg1 + seg2;
    }
}
export class HpaPathfindingWorker {
    constructor() {
        this.buffers = new HpaBufferManager();
        this.topology = new HpaTopologyArena();
        this.graph = new HpaRegionGraphManager(this.buffers);
        this.searchState = null;
        this.planner = null;
    }
    applyPathSabFromMessage(data) {
        if (!data.maxPathLen || data.maxPathLen <= this.buffers.maxPathLen) return;
        this.buffers.sabPathIdxPool = data.sabPathIdxPool;
        this.buffers.maxPathLen = data.maxPathLen;
        if (this.planner) {
            this.planner.localPathScratch = new Int32Array(this.buffers.maxPathLen);
            this.planner.portalLegScratch = new Int32Array(this.buffers.maxPathLen);
        }
    }
    postGraphPatchDone(meta) {
        self.postMessage({ type: "graphPatchDone", nodeCount: meta?.nodeCount ?? 0, edgeWrite: meta?.edgeWrite ?? 0, nodeIds: meta?.nodeIds ?? [] });
    }
    postGraphPatchError(err) {
        console.error("Worker graph patch error:", err.stack || err);
        self.postMessage({ type: "graphPatchError", message: err?.message ?? String(err) });
    }
    runGraphPatch(fn) {
        try {
            this.postGraphPatchDone(fn());
        } catch (err) {
            this.postGraphPatchError(err);
        }
    }
    runReplan(slot, data) {
        const frame = this.topology.requireGridFrame();
        const cellToRegion = new Int16Array(this.buffers.sabCellToRegionIdx, 0, frame.cols * frame.rows);
        const baseGraph = this.graph.abstractGraph();
        const context = new HpaReplanContext({ frame, topology: this.topology.requireNavTopology(), navView: this.topology.navView, graph: baseGraph, cellToRegion, portalTargetIdx: this.topology.portalTargetIdx });
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
            if (!this.searchState) {
                this.searchState = new SearchState(searchStateSize);
                if (!this.planner) this.planner = new HpaReplanPlanner(this.buffers, this.searchState);
            } else this.searchState.resize(searchStateSize);
            self.postMessage({ type: "syncNavDone" });
            return;
        }
        if (type === "buildRegionGraphFull") {
            if (e.data.sabCellToRegionIdx) this.buffers.sabCellToRegionIdx = e.data.sabCellToRegionIdx;
            this.runGraphPatch(() => this.graph.buildRegionGraphFull(this.topology.requireGridFrame(), this.topology.requireNavTopology(), this.topology.navView, { ...e.data, portalTargetIdx: this.topology.portalTargetIdx }));
            return;
        }
        if (type === "patchRegionGraph") {
            if (e.data.sabCellToRegionIdx) this.buffers.sabCellToRegionIdx = e.data.sabCellToRegionIdx;
            this.runGraphPatch(() => this.graph.patchRegionGraph(this.topology.requireGridFrame(), this.topology.requireNavTopology(), this.topology.navView, { ...e.data, portalTargetIdx: this.topology.portalTargetIdx }));
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
