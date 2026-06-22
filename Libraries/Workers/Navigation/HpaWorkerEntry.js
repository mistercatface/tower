import { FlatAbstractGraphSearch, FlatGridSearch, GridPathQuery } from "../../Pathfinding/AStar.js";
import { createNavStepPenaltyLookup } from "../../Pathfinding/navStepPenalty.js";
import { FlatGridView } from "../../Pathfinding/FlatGridView.js";
import { createNavSimView, bindNavSimEdgePool, bindNavSimGridFrame } from "../../Pathfinding/navSimView.js";
import { bindNavEdgePoolFromSab } from "../../Spatial/grid/navEdgePoolSab.js";
import { stitchAbstractCellPath } from "../../Pathfinding/hpaStitch.js";
import { HpaAbstractGraph } from "../../Pathfinding/hpaReplanPrep.js";
import { prepareHpaReplanPrep, HPA_LOCAL_MAX_LEN } from "../../Pathfinding/hpaPathRequest.js";
import { buildFullRegionGraph, packRegionGraphFlat, rebuildDamagedRegionGraph } from "../../Pathfinding/hpaRegionGraph.js";
import { createNavLocalView, navTopologyFromSab } from "../../Pathfinding/navTopologySab.js";
import { bakeNavTopologyIntoArena } from "../../Pathfinding/bakeNavTopology.js";
import { hpaPathSlotAbstractIdx, hpaPathSlotCols, hpaPathSlotMeta, hpaPathSlotRows, PersistedHpaGraphWriter } from "../../Pathfinding/hpaWorkerSab.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
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
        this.sabPathColsPool = null;
        this.sabPathRowsPool = null;
        this.sabAbstractIdxPool = null;
        this.sabPersistGraphNodeCol = null;
        this.sabPersistGraphNodeRow = null;
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
        this.sabPathColsPool = data.sabPathColsPool;
        this.sabPathRowsPool = data.sabPathRowsPool;
        this.sabAbstractIdxPool = data.sabAbstractIdxPool;
        this.sabPersistGraphNodeCol = data.sabPersistGraphNodeCol;
        this.sabPersistGraphNodeRow = data.sabPersistGraphNodeRow;
        this.sabPersistGraphEdgeOffsets = data.sabPersistGraphEdgeOffsets;
        this.sabPersistGraphEdgeTargets = data.sabPersistGraphEdgeTargets;
        this.sabPersistGraphEdgeCosts = data.sabPersistGraphEdgeCosts;
        this.sabPersistGraphEdgeSources = data.sabPersistGraphEdgeSources;
        this.sabCellToRegionIdx = data.sabCellToRegionIdx;
    }
    writeCellPath(slot, path) {
        const pathMeta = hpaPathSlotMeta(this.sabPathMetaPool, slot);
        pathMeta[0] = path ? path.length : 0;
        if (!path) return;
        const pathCols = hpaPathSlotCols(this.sabPathColsPool, slot, this.maxPathLen);
        const pathRows = hpaPathSlotRows(this.sabPathRowsPool, slot, this.maxPathLen);
        for (let i = 0; i < path.length; i++) {
            pathCols[i] = path[i].col;
            pathRows[i] = path[i].row;
        }
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
        this.passageEdgeCount = 0;
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
        this.passageEdgeCount = data.passageEdgeCount;
        const gridFill = new Uint8Array(data.sabGridFill);
        const floorKind = new Uint8Array(data.sabFloorKind);
        const floorFacing = new Uint8Array(data.sabFloorFacing);
        const edgeSlots = new Int32Array(data.sabEdgeSlots);
        this.cardinalOpen = new Uint8Array(data.sabCardinalOpen);
        this.vertexPassability = new Uint8Array(data.sabVertexPassability);
        const edgePool = bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount);
        this.navSimView = createNavSimView(this.gridFrame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, this.passageEdgeCount, this.vertexPassability);
        this.navTopology = navTopologyFromSab(data.sabBlocked, data.sabOctileNeighbors, data.sabOctilePredecessors);
        this.navView = createNavLocalView(this.requireGridFrame(), this.navTopology);
        this.navArenaBound = true;
    }
    syncNavSimEdgePool() {
        bindNavSimEdgePool(this.navSimView, bindNavEdgePoolFromSab(new Uint8Array(this.sabEdgePool), this.edgePoolCount), this.passageEdgeCount);
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
            if (data.edgePoolCount !== this.edgePoolCount || data.passageEdgeCount !== this.passageEdgeCount) {
                this.edgePoolCount = data.edgePoolCount;
                this.passageEdgeCount = data.passageEdgeCount;
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
        return new HpaAbstractGraph(graph.nodeCol, graph.nodeRow, graph.edgeOffsets, graph.edgeTargets, graph.edgeCosts, graph.nodeCount, graph.edgeWrite, graph.nodeIds);
    }
    buildRegionGraphFull(gridFrame, topology, navView, data) {
        const frame = gridFrame;
        const built = buildFullRegionGraph({
            blocked: topology.blocked,
            frame,
            navGraph: navView,
            maxCellsPerChunk: this.buffers.maxCellsPerChunk,
            minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk,
            seedWorldX: data.seedWorldX,
            seedWorldY: data.seedWorldY,
        });
        this.regionGraphState = {
            ...built,
            maxCellsPerChunk: this.buffers.maxCellsPerChunk,
            minCellsPerChunk: data.minCellsPerChunk ?? this.buffers.minCellsPerChunk,
            damagePadding: data.damagePadding,
            seedWorldX: data.seedWorldX,
            seedWorldY: data.seedWorldY,
            distToWall: null,
        };
        return this.writeRegionGraphToSab(gridFrame);
    }
    patchRegionGraph(gridFrame, topology, navView, data) {
        if (data.seedWorldX != null) this.regionGraphState.seedWorldX = data.seedWorldX;
        if (data.seedWorldY != null) this.regionGraphState.seedWorldY = data.seedWorldY;
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
        this.grid = new FlatGridView(frame.cols, frame.rows, { blocked: topology.blocked, canStep: (c0, r0, c1, r1) => navView.canStep(c0, r0, c1, r1) });
    }
}
export class HpaReplanPlanner {
    constructor(buffers, searchState) {
        this.buffers = buffers;
        this.searchState = searchState;
    }
    run(slot, context, data) {
        const query = new GridPathQuery(data.query.start, data.query.target);
        const gridSearch = new FlatGridSearch({ grid: context.grid, searchState: this.searchState, stepPenaltyLookup: context.penaltyLookup });
        const prep = prepareHpaReplanPrep(context.frame.cols, context.cellToRegion, context.graph, query);
        if (prep.mode === "local") return this.writeLocalResult(slot, gridSearch, query);
        return this.writeHpaResult(slot, gridSearch, context.graph, prep, query);
    }
    writeLocalResult(slot, gridSearch, query) {
        const path = gridSearch.local(query, HPA_LOCAL_MAX_LEN);
        this.buffers.writeCellPath(slot, path);
        this.buffers.writeAbstractPath(slot, null);
        return this.buffers.buildReplanResult(slot);
    }
    writeHpaResult(slot, gridSearch, baseGraph, prep, query) {
        const { extendedGraph, startTemp, targetTemp, tempLegs } = baseGraph.buildExtended(query, prep, this.buffers.maxCellsPerChunk, (legQuery) => {
            const path = gridSearch.local(legQuery, prep.regionConnectMaxLen);
            return path ? { cost: path.length, path } : { cost: 0 };
        });
        const abstractSearch = new FlatAbstractGraphSearch({ graph: extendedGraph, searchState: this.searchState });
        const abstractPath = abstractSearch.run(startTemp, targetTemp);
        this.buffers.writeAbstractPath(slot, abstractPath);
        if (!abstractPath) {
            this.buffers.writeCellPath(slot, null);
            return this.buffers.buildReplanResult(slot);
        }
        const cellPath = stitchAbstractCellPath(abstractPath, prep, tempLegs, (aIdx, bIdx) => this.resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx));
        this.buffers.writeCellPath(slot, cellPath);
        return this.buffers.buildReplanResult(slot);
    }
    resolveRegionLeg(gridSearch, baseGraph, prep, aIdx, bIdx) {
        return gridSearch.local(
            new GridPathQuery({ col: baseGraph.nodeCol[aIdx], row: baseGraph.nodeRow[aIdx] }, { col: baseGraph.nodeCol[bIdx], row: baseGraph.nodeRow[bIdx] }),
            prep.regionConnectMaxLen,
        );
    }
}
export class HpaPathfindingWorker {
    constructor() {
        this.buffers = new HpaBufferManager();
        this.topology = new HpaTopologyArena();
        this.graph = new HpaRegionGraphManager(this.buffers);
        this.searchState = null;
    }
    postGraphPatchDone(meta) {
        self.postMessage({ type: "graphPatchDone", nodeCount: meta?.nodeCount ?? 0, edgeWrite: meta?.edgeWrite ?? 0, nodeIds: meta?.nodeIds ?? [] });
    }
    postGraphPatchError(err) {
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
        const stepPenaltyLookup = data.stepPenaltyKeys?.length > 0 ? createNavStepPenaltyLookup(frame.cols, data.stepPenaltyKeys, data.stepPenaltyCosts) : null;
        const cellToRegion = new Int16Array(this.buffers.sabCellToRegionIdx, 0, frame.cols * frame.rows);
        const baseGraph = this.graph.abstractGraph();
        const context = new HpaReplanContext({ frame, topology: this.topology.requireNavTopology(), navView: this.topology.navView, graph: baseGraph, penaltyLookup: stepPenaltyLookup, cellToRegion });
        return new HpaReplanPlanner(this.buffers, this.searchState).run(slot, context, data);
    }
    onMessage(e) {
        const { type, slot, requestId } = e.data;
        if (type === "init") {
            const data = e.data.data;
            this.buffers.init(data);
            const size = data.maxGraphNodes || 4096;
            this.searchState = new SearchState(size + 2);
            return;
        }
        if (type === "buildNavTopology") {
            this.topology.buildNavTopologyOnWorker(e.data);
            const size = this.topology.requireGridFrame().cols * this.topology.requireGridFrame().rows;
            const searchStateSize = Math.max(size, (this.buffers.maxGraphNodes || 4096) + 2);
            if (!this.searchState) this.searchState = new SearchState(searchStateSize);
            else this.searchState.resize(searchStateSize);
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
