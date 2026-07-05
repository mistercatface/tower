import {
    FlatAbstractGraphSearch,
    FlatGridSearch,
    SearchState,
    createNavSimView,
    bindNavSimEdgePool,
    bindNavSimGridFrame,
    HpaAbstractGraph,
    prepareHpaReplanPrep,
    HPA_LOCAL_MAX_LEN,
    buildFullRegionGraph,
    packRegionGraphFlat,
    rebuildDamagedRegionGraph,
    createNavLocalView,
    navTopologyFromSab,
    bakeNavTopologyIntoArena,
} from "../../Navigation/navigation.js";
import { bindNavEdgePoolFromSab } from "../../Spatial/spatial.js";
import { hpaPathSlotAbstractIdx, hpaPathSlotIdx, hpaPathSlotMeta, PersistedHpaGraphWriter } from "../../Pathfinding/hpaWorkerSab.js";
import { packCellKey, KEY_STRIDE } from "../../DataStructures/CellKey.js";
import { FloorBelt } from "../../Spatial/spatial.js";
const CONVEYOR_AGAINST_FLOW_PENALTY = 20;
const CONVEYOR_LATERAL_PENALTY = 5;
const CONVEYOR_DIAGONAL_PENALTY = 8;
export function getStepPenalty(currIdx, nIdx, cols, floorKind, floorFacing) {
    const kind_curr = floorKind[currIdx];
    const kind_n = floorKind[nIdx];
    if (!FloorBelt.isBelt(kind_curr) && !FloorBelt.isBelt(kind_n)) return 0;
    let penalty_out = 0;
    if (FloorBelt.isBelt(kind_curr)) {
        const diff = nIdx - currIdx;
        let side = -1;
        if (diff === -cols) side = 0;
        else if (diff === 1) side = 1;
        else if (diff === cols) side = 2;
        else if (diff === -1) side = 3;
        if (side === -1) penalty_out = CONVEYOR_DIAGONAL_PENALTY;
        else {
            const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind_curr, floorFacing[currIdx]);
            if (side === exitSide) penalty_out = 0;
            else if (side === entrySide) penalty_out = CONVEYOR_AGAINST_FLOW_PENALTY;
            else penalty_out = CONVEYOR_LATERAL_PENALTY;
        }
    }
    let penalty_in = 0;
    if (FloorBelt.isBelt(kind_n)) {
        const diff_in = currIdx - nIdx;
        let side_n = -1;
        if (diff_in === -cols) side_n = 0;
        else if (diff_in === 1) side_n = 1;
        else if (diff_in === cols) side_n = 2;
        else if (diff_in === -1) side_n = 3;
        if (side_n === -1) penalty_in = CONVEYOR_DIAGONAL_PENALTY;
        else {
            const { entrySide, exitSide } = FloorBelt.getEntryExitSides(kind_n, floorFacing[nIdx]);
            if (side_n === entrySide) penalty_in = 0;
            else if (side_n === exitSide) penalty_in = CONVEYOR_AGAINST_FLOW_PENALTY;
            else penalty_in = CONVEYOR_LATERAL_PENALTY;
        }
    }
    return Math.max(penalty_out, penalty_in);
}
export function createNavStepPenaltyLookup(cols, keys, costs, floorKind = null, floorFacing = null) {
    let maxIdx = 0;
    if (keys && keys.length)
        for (let i = 0; i < keys.length; i++) {
            const idx = keys[i];
            if (idx > maxIdx) maxIdx = idx;
        }
    const costArray = keys && keys.length ? new Uint8Array(maxIdx + 1) : null;
    if (keys && keys.length) for (let i = 0; i < keys.length; i++) costArray[keys[i]] = costs[i];
    return {
        extraCost(idx, currIdx) {
            let cost = 0;
            if (costArray && idx < costArray.length) cost += costArray[idx];
            if (floorKind && floorFacing && currIdx !== undefined) cost += getStepPenalty(currIdx, idx, cols, floorKind, floorFacing);
            return cost;
        },
    };
}
export function stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outIdx, cols) {
    if (!abstractIdx || !abstractIdx.length) return 0;
    let offset = 0;
    const lastLeg = abstractIdx.length - 1;
    const { nodeIdx, nodeCount, startIdx, targetIdx } = prep;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    for (let i = 0; i < lastLeg; i++) {
        const aIdx = abstractIdx[i];
        const bIdx = abstractIdx[i + 1];
        const legKey = (aIdx << 16) | bIdx;
        let legOffset = tempLegsOffsets.get(legKey);
        let legLen = 0;
        let isTempLeg = true;
        if (legOffset !== undefined) legLen = tempLegsLengths.get(legKey);
        else if (aIdx < nodeCount && bIdx < nodeCount) {
            legLen = resolveRegionLeg(aIdx, bIdx);
            isTempLeg = false;
        }
        if (legLen > 0) {
            const start = offset === 0 ? 0 : 1;
            if (isTempLeg) for (let j = start; j < legLen; j++) outIdx[offset++] = tempLegsBuffer[legOffset + j];
            else for (let j = start; j < legLen; j++) outIdx[offset++] = resolveRegionLeg.scratch[j];
            continue;
        }
        const aCellIdx = aIdx === startTemp ? startIdx : aIdx === targetTemp ? targetIdx : nodeIdx[aIdx];
        const bCellIdx = bIdx === startTemp ? startIdx : bIdx === targetTemp ? targetIdx : nodeIdx[bIdx];
        if (offset === 0) outIdx[offset++] = aCellIdx;
        outIdx[offset++] = bCellIdx;
    }
    return offset;
}
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
        const floorKind = new Uint8Array(data.sabFloorKind);
        const floorFacing = new Uint8Array(data.sabFloorFacing);
        const edgeSlots = new Int32Array(data.sabEdgeSlots);
        this.cardinalOpen = new Uint8Array(data.sabCardinalOpen);
        this.vertexPassability = new Uint8Array(data.sabVertexPassability);
        const edgePool = bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount);
        this.navSimView = createNavSimView(this.gridFrame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, this.vertexPassability);
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
        const built = buildFullRegionGraph({
            blocked: topology.blocked,
            frame,
            navGraph: navView,
            maxCellsPerChunk: this.buffers.maxCellsPerChunk,
            minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk,
        });
        this.regionGraphState = {
            ...built,
            maxCellsPerChunk: this.buffers.maxCellsPerChunk,
            minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk,
            damagePadding: data.damagePadding,
            distToWall: null,
        };
        return this.writeRegionGraphToSab(gridFrame);
    }
    patchRegionGraph(gridFrame, topology, navView, data) {
        if (!this.regionGraphState) return this.buildRegionGraphFull(gridFrame, topology, navView, data);
        rebuildDamagedRegionGraph(this.regionGraphState, data.bounds, gridFrame, topology.blocked, navView);
        return this.writeRegionGraphToSab(gridFrame);
    }
}
export class HpaReplanContext {
    constructor({ frame, topology, navView, graph, penaltyLookup, cellToRegion }) {
        this.frame = frame;
        this.topology = topology;
        this.navView = navView;
        this.graph = graph;
        this.penaltyLookup = penaltyLookup;
        this.cellToRegion = cellToRegion;
    }
}
export class HpaReplanPlanner {
    constructor(buffers, searchState) {
        this.buffers = buffers;
        this.searchState = searchState;
        this.tempLegsBuffer = new Int32Array(32768);
        this.tempLegsOffsets = new Map();
        this.tempLegsLengths = new Map();
        this.gridSearch = new FlatGridSearch(this.searchState);
        this.localPathScratch = new Int32Array(this.buffers.maxPathLen);
        this.abstractPathScratch = new Int32Array(this.buffers.maxAbstractLen);
        this.abstractPathList = [];
    }
    run(slot, context, data) {
        const startIdx = data.startIdx;
        const targetIdx = data.targetIdx;
        const cols = context.frame.cols;
        const rows = context.frame.rows;
        this.gridSearch.neighbors = context.topology.octileNeighbors;
        this.gridSearch.cols = cols;
        this.gridSearch.stepPenaltyLookup = context.penaltyLookup;
        const prep = prepareHpaReplanPrep(cols, context.cellToRegion, context.graph, startIdx, targetIdx);
        if (prep.mode === "local") return this.writeLocalResult(slot, this.gridSearch, startIdx, targetIdx, cols);
        return this.writeHpaResult(slot, this.gridSearch, context.graph, prep, startIdx, targetIdx, cols);
    }
    writeLocalResult(slot, gridSearch, startIdx, targetIdx, cols) {
        const len = gridSearch.local(startIdx, targetIdx, HPA_LOCAL_MAX_LEN, this.localPathScratch);
        if (len === 0) {
            this.buffers.writeCellPath(slot, this.localPathScratch, 0);
            this.buffers.writeAbstractPath(slot, null);
            return this.buffers.buildReplanResult(slot);
        }
        this.buffers.writeCellPath(slot, this.localPathScratch, len);
        this.buffers.writeAbstractPath(slot, null);
        return this.buffers.buildReplanResult(slot);
    }
    writeHpaResult(slot, gridSearch, baseGraph, prep, startIdx, targetIdx, cols) {
        this.tempLegsOffsets.clear();
        this.tempLegsLengths.clear();
        const { extendedGraph, startTemp, targetTemp } = baseGraph.buildExtended(startIdx, targetIdx, cols, prep, this.buffers.maxCellsPerChunk, (lStartIdx, lTargetIdx, legKey, offset) => {
            const len = gridSearch.local(lStartIdx, lTargetIdx, prep.regionConnectMaxLen, this.tempLegsBuffer.subarray(offset));
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
        const resolveFn = (aIdx, bIdx) => this.resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx, cols);
        resolveFn.scratch = this.localPathScratch;
        const pathLen = stitchAbstractCellPath(abstractPath, prep, this.tempLegsBuffer, this.tempLegsOffsets, this.tempLegsLengths, resolveFn, pathIdx, cols);
        const pathMeta = hpaPathSlotMeta(this.buffers.sabPathMetaPool, slot);
        pathMeta[0] = pathLen;
        return this.buffers.buildReplanResult(slot);
    }
    resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx, cols) {
        const startIdx = baseGraph.nodeIdx[aIdx];
        const targetIdx = baseGraph.nodeIdx[bIdx];
        const len = gridSearch.local(startIdx, targetIdx, prep.regionConnectMaxLen, this.localPathScratch);
        return len;
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
        const simView = this.topology.navSimView;
        const floorKind = simView?.floorKind ?? null;
        const floorFacing = simView?.floorFacing ?? null;
        const stepPenaltyLookup = createNavStepPenaltyLookup(frame.cols, data.stepPenaltyKeys, data.stepPenaltyCosts, floorKind, floorFacing);
        const cellToRegion = new Int16Array(this.buffers.sabCellToRegionIdx, 0, frame.cols * frame.rows);
        const baseGraph = this.graph.abstractGraph();
        const context = new HpaReplanContext({ frame, topology: this.topology.requireNavTopology(), navView: this.topology.navView, graph: baseGraph, penaltyLookup: stepPenaltyLookup, cellToRegion });
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
            this.runGraphPatch(() => this.graph.buildRegionGraphFull(this.topology.requireGridFrame(), this.topology.requireNavTopology(), this.topology.navView, e.data));
            return;
        }
        if (type === "patchRegionGraph") {
            if (e.data.sabCellToRegionIdx) this.buffers.sabCellToRegionIdx = e.data.sabCellToRegionIdx;
            this.runGraphPatch(() => this.graph.patchRegionGraph(this.topology.requireGridFrame(), this.topology.requireNavTopology(), this.topology.navView, e.data));
            return;
        }
        if (type === "replan") {
            const replanResult = this.runReplan(slot, e.data);
            self.postMessage({ type: "hpaDone", slot, requestId, replanResult });
        }
    }
}
const worker = new HpaPathfindingWorker();
self.onmessage = (e) => worker.onMessage(e);
