import { runLocalAStarFlat, runAbstractAStarFlat } from "../../Pathfinding/AStar.js";
import { createNavStepPenaltyLookup } from "../../Pathfinding/navStepPenalty.js";
import { createNavSimView, bindNavSimEdgePool, bindNavSimGridFrame } from "../../Pathfinding/navSimView.js";
import { bindNavEdgePoolFromSab } from "../../Spatial/grid/navEdgePoolSab.js";
import { stitchAbstractCellPath } from "../../Pathfinding/hpaStitch.js";
import { HpaAbstractGraph } from "../../Pathfinding/hpaReplanPrep.js";
import { prepareHpaReplanPrep, HPA_LOCAL_MAX_LEN } from "../../Pathfinding/hpaPathRequest.js";
import { buildFullRegionGraph, packRegionGraphFlat, rebuildDamagedRegionGraph } from "../../Pathfinding/hpaRegionGraph.js";
import { createNavLocalView, navTopologyFromSab } from "../../Pathfinding/navTopologySab.js";
import { bakeNavTopologyIntoArena } from "../../Pathfinding/bakeNavTopology.js";
import {
    hpaCellToRegionView,
    hpaPathSlotAbstractIdx,
    hpaPathSlotCols,
    hpaPathSlotMeta,
    hpaPathSlotRows,
    hpaPersistEdgeCostsView,
    hpaPersistEdgeOffsetsView,
    hpaPersistEdgeSourcesView,
    hpaPersistEdgeTargetsView,
    hpaPersistNodeColView,
    hpaPersistNodeRowView,
} from "../../Pathfinding/hpaWorkerSab.js";
import { SearchState } from "../../Pathfinding/SearchState.js";
let maxSlots;
let maxPathLen;
let maxAbstractLen;
let maxGraphNodes;
let maxGraphEdges;
let maxCellsPerChunk;
let minCellsPerChunk;
let sabPathMetaPool;
let sabPathColsPool;
let sabPathRowsPool;
let sabAbstractIdxPool;
let sabPersistGraphNodeCol;
let sabPersistGraphNodeRow;
let sabPersistGraphEdgeOffsets;
let sabPersistGraphEdgeTargets;
let sabPersistGraphEdgeCosts;
let sabPersistGraphEdgeSources;
let sabCellToRegionIdx;
let navCacheKey = "";
/** @type {import("../../Pathfinding/navTopologySab.js").NavTopology | null} */
let navTopology = null;
let navView;
let searchState;
let persistNodeCount = 0;
let persistEdgeWrite = 0;
/** @type {string[]} */
let persistNodeIds = [];
/** @type {import("../../Pathfinding/GridNavSnapshot.js").GridFrame | null} */
let gridFrame = null;
/** @type {ReturnType<typeof createNavSimView> | null} */
let navSimView = null;
/** @type {{
 *   nodesMap: Record<string, object>,
 *   cellToNode: Array<object | null>,
 *   nodeIdCounter: number,
 *   distToWall: Float32Array | null,
 *   maxCellsPerChunk: number,
 *   minCellsPerChunk: number,
 *   damagePadding: number,
 *   seedWorldX: number | null,
 *   seedWorldY: number | null,
 * } | null} */
let regionGraphState = null;
let navArenaBound = false;
let sabEdgePool;
let edgePoolCount = 0;
let passageEdgeCount = 0;
let cardinalOpen;
let vertexPassability;
function requireGridFrame() {
    if (!gridFrame) throw new Error("HPA worker missing grid frame");
    return gridFrame;
}
function assertGraphFrameKey(gridFrameKey) {
    if (gridFrameKey !== requireGridFrame().key) throw new Error(`HPA grid frame mismatch: worker ${gridFrame.key}, request ${gridFrameKey ?? ""}`);
}
function syncGridFrame(frame) {
    if (gridFrame?.key === frame.key) {
        if (gridFrame.cols !== frame.cols || gridFrame.rows !== frame.rows) throw new Error("nav sync grid size mismatch for unchanged frame key");
        gridFrame = frame;
        if (navSimView) bindNavSimGridFrame(navSimView, frame);
        return;
    }
    const sizeChanged = !gridFrame || gridFrame.cols !== frame.cols || gridFrame.rows !== frame.rows;
    gridFrame = frame;
    if (sizeChanged) {
        navSimView = null;
        regionGraphState = null;
        navTopology = null;
        navCacheKey = "";
        navArenaBound = false;
    } else if (navSimView) bindNavSimGridFrame(navSimView, frame);
}
function bindNavArena(data) {
    syncGridFrame(data.gridFrame);
    sabEdgePool = data.sabEdgePool;
    edgePoolCount = data.edgePoolCount;
    passageEdgeCount = data.passageEdgeCount;
    const gridFill = new Uint8Array(data.sabGridFill);
    const floorKind = new Uint8Array(data.sabFloorKind);
    const floorFacing = new Uint8Array(data.sabFloorFacing);
    const edgeSlots = new Int32Array(data.sabEdgeSlots);
    cardinalOpen = new Uint8Array(data.sabCardinalOpen);
    vertexPassability = new Uint8Array(data.sabVertexPassability);
    const edgePool = bindNavEdgePoolFromSab(new Uint8Array(sabEdgePool), edgePoolCount);
    navSimView = createNavSimView(gridFrame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, passageEdgeCount, vertexPassability);
    navTopology = navTopologyFromSab(data.sabBlocked, data.sabOctileNeighbors, data.sabOctilePredecessors);
    navView = createNavLocalView(requireGridFrame(), navTopology);
    const size = requireGridFrame().cols * requireGridFrame().rows;
    const searchStateSize = Math.max(size, (maxGraphNodes || 4096) + 2);
    if (!searchState) searchState = new SearchState(searchStateSize);
    else searchState.resize(searchStateSize);
    navArenaBound = true;
}
function syncNavSimEdgePool() {
    bindNavSimEdgePool(navSimView, bindNavEdgePoolFromSab(new Uint8Array(sabEdgePool), edgePoolCount), passageEdgeCount);
}
function requireNavSimBake() {
    if (!navArenaBound || !navSimView) throw new Error("HPA worker nav arena not bound");
    return { simView: navSimView, cardinalOpen, vertexPassability };
}
function requireNavTopology() {
    if (!navTopology) throw new Error("HPA worker missing nav topology");
    return navTopology;
}
function bakeNavTopology(damageBounds) {
    const frame = requireGridFrame();
    const baked = requireNavSimBake();
    const topology = requireNavTopology();
    bakeNavTopologyIntoArena(baked.simView, topology, baked.cardinalOpen, baked.vertexPassability, damageBounds);
    return baked;
}
function buildNavTopologyOnWorker(data) {
    if (data.rebindArena) bindNavArena(data);
    else {
        if (!navArenaBound) throw new Error("buildNavTopology requires bound nav arena");
        syncGridFrame(data.gridFrame);
        if (data.edgePoolCount !== edgePoolCount || data.passageEdgeCount !== passageEdgeCount) {
            edgePoolCount = data.edgePoolCount;
            passageEdgeCount = data.passageEdgeCount;
            syncNavSimEdgePool();
        }
    }
    navCacheKey = data.navCacheKey;
    bakeNavTopology(data.damageBounds ?? null);
}
function buildPersistGraphCsr(nodeCount, edgeWrite) {
    const srcSources = hpaPersistEdgeSourcesView(sabPersistGraphEdgeSources, maxGraphEdges).subarray(0, edgeWrite);
    const edgeOffsets = hpaPersistEdgeOffsetsView(sabPersistGraphEdgeOffsets, maxGraphNodes);
    edgeOffsets.fill(0, 0, nodeCount + 1);
    for (let e = 0; e < edgeWrite; e++) {
        const src = srcSources[e];
        if (src >= 0 && src < nodeCount) edgeOffsets[src + 1]++;
    }
    let sum = 0;
    for (let i = 0; i < nodeCount; i++) {
        const count = edgeOffsets[i + 1];
        edgeOffsets[i] = sum;
        sum += count;
    }
    edgeOffsets[nodeCount] = sum;
    return sum;
}
function syncPersistAbstractGraph(nodeCount, edgeWrite) {
    persistNodeCount = nodeCount;
    persistEdgeWrite = buildPersistGraphCsr(nodeCount, edgeWrite);
}
function writeRegionGraphToSab() {
    if (!regionGraphState) return null;
    const frame = requireGridFrame();
    const packed = packRegionGraphFlat(regionGraphState.nodesMap, regionGraphState.cellToNode, frame);
    if (packed.nodeCount > maxGraphNodes) throw new Error(`HPA region graph has ${packed.nodeCount} nodes (max ${maxGraphNodes})`);
    const persistNodeCol = hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes);
    const persistNodeRow = hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes);
    const persistEdgeSources = hpaPersistEdgeSourcesView(sabPersistGraphEdgeSources, maxGraphEdges);
    const persistEdgeTargets = hpaPersistEdgeTargetsView(sabPersistGraphEdgeTargets, maxGraphEdges);
    const persistEdgeCosts = hpaPersistEdgeCostsView(sabPersistGraphEdgeCosts, maxGraphEdges);
    persistNodeCol.set(packed.nodeCol);
    persistNodeRow.set(packed.nodeRow);
    persistEdgeSources.set(packed.edgeSources);
    persistEdgeTargets.set(packed.edgeTargets);
    persistEdgeCosts.set(packed.edgeCosts);
    hpaCellToRegionView(sabCellToRegionIdx, frame.cols * frame.rows).set(packed.cellToRegion);
    syncPersistAbstractGraph(packed.nodeCount, packed.edgeWrite);
    persistNodeIds = packed.nodeIds;
    return { nodeCount: packed.nodeCount, edgeWrite: packed.edgeWrite, nodeIds: packed.nodeIds };
}
function buildRegionGraphFullOnWorker(data) {
    if (!navTopology) throw new Error("buildRegionGraphFull requires nav topology");
    assertGraphFrameKey(data.gridFrameKey);
    const frame = requireGridFrame();
    const topology = requireNavTopology();
    const built = buildFullRegionGraph({
        blocked: topology.blocked,
        frame,
        navGraph: navView,
        maxCellsPerChunk,
        minCellsPerChunk: data.minCellsPerChunk ?? minCellsPerChunk,
        seedWorldX: data.seedWorldX,
        seedWorldY: data.seedWorldY,
    });
    regionGraphState = {
        ...built,
        maxCellsPerChunk,
        minCellsPerChunk: data.minCellsPerChunk ?? minCellsPerChunk,
        damagePadding: data.damagePadding,
        seedWorldX: data.seedWorldX,
        seedWorldY: data.seedWorldY,
        distToWall: null,
    };
    return writeRegionGraphToSab();
}
function patchRegionGraphOnWorker(data) {
    if (!navTopology || !regionGraphState) throw new Error("patchRegionGraph requires nav topology and region graph");
    assertGraphFrameKey(data.gridFrameKey);
    if (data.seedWorldX != null) regionGraphState.seedWorldX = data.seedWorldX;
    if (data.seedWorldY != null) regionGraphState.seedWorldY = data.seedWorldY;
    rebuildDamagedRegionGraph(
        regionGraphState,
        { startCol: data.startCol, endCol: data.endCol, startRow: data.startRow, endRow: data.endRow },
        requireGridFrame(),
        requireNavTopology().blocked,
        navView,
    );
    return writeRegionGraphToSab();
}
function postGraphPatchDone(meta) {
    self.postMessage({ type: "graphPatchDone", nodeCount: meta?.nodeCount ?? 0, edgeWrite: meta?.edgeWrite ?? 0, nodeIds: meta?.nodeIds ?? [] });
}
function postGraphPatchError(err) {
    self.postMessage({ type: "graphPatchError", message: err?.message ?? String(err) });
}
function runGraphPatch(fn) {
    try {
        postGraphPatchDone(fn());
    } catch (err) {
        postGraphPatchError(err);
    }
}
function writeCellPath(slot, path) {
    const pathMeta = hpaPathSlotMeta(sabPathMetaPool, slot);
    pathMeta[0] = path ? path.length : 0;
    if (!path) return;
    const pathCols = hpaPathSlotCols(sabPathColsPool, slot, maxPathLen);
    const pathRows = hpaPathSlotRows(sabPathRowsPool, slot, maxPathLen);
    for (let i = 0; i < path.length; i++) {
        pathCols[i] = path[i].col;
        pathRows[i] = path[i].row;
    }
}
function writeAbstractPath(slot, pathIdx) {
    const pathMeta = hpaPathSlotMeta(sabPathMetaPool, slot);
    pathMeta[1] = pathIdx ? pathIdx.length : 0;
    if (!pathIdx) return;
    const abstractIdx = hpaPathSlotAbstractIdx(sabAbstractIdxPool, slot, maxAbstractLen);
    for (let i = 0; i < pathIdx.length; i++) abstractIdx[i] = pathIdx[i];
}
function buildReplanResult(slot) {
    const pathLen = hpaPathSlotMeta(sabPathMetaPool, slot)[0];
    return pathLen > 0 ? { pathLen } : null;
}
function runReplan(slot, data) {
    const { startCol, startRow, targetCol, targetRow } = data;
    const { cols, rows } = requireGridFrame();
    const stepPenaltyLookup = data.stepPenaltyKeys?.length > 0 ? createNavStepPenaltyLookup(cols, data.stepPenaltyKeys, data.stepPenaltyCosts) : null;
    const localAStar = (fromCol, fromRow, toCol, toRow, maxLen) => runLocalAStarFlat(fromCol, fromRow, toCol, toRow, navView, cols, rows, maxLen, searchState.prepare(), stepPenaltyLookup);
    const cellToRegion = hpaCellToRegionView(sabCellToRegionIdx, cols * rows);
    const baseGraph = new HpaAbstractGraph(
        hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes).subarray(0, persistNodeCount),
        hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes).subarray(0, persistNodeCount),
        hpaPersistEdgeOffsetsView(sabPersistGraphEdgeOffsets, maxGraphNodes).subarray(0, persistNodeCount + 1),
        hpaPersistEdgeTargetsView(sabPersistGraphEdgeTargets, maxGraphEdges).subarray(0, persistEdgeWrite),
        hpaPersistEdgeCostsView(sabPersistGraphEdgeCosts, maxGraphEdges).subarray(0, persistEdgeWrite),
        persistNodeCount,
        persistEdgeWrite,
        persistNodeIds,
    );
    const prep = prepareHpaReplanPrep(cols, cellToRegion, baseGraph, startCol, startRow, targetCol, targetRow);
    if (prep.mode === "local") {
        const path = localAStar(startCol, startRow, targetCol, targetRow, HPA_LOCAL_MAX_LEN);
        writeCellPath(slot, path);
        writeAbstractPath(slot, null);
        return buildReplanResult(slot);
    }
    const { extendedGraph, startTemp, targetTemp, tempLegs } = baseGraph.buildExtended(startCol, startRow, targetCol, targetRow, maxCellsPerChunk, (fromCol, fromRow, toCol, toRow) => {
        const path = localAStar(fromCol, fromRow, toCol, toRow, prep.regionConnectMaxLen);
        return path ? { cost: path.length, path } : { cost: 0 };
    });
    const abstractPath = runAbstractAStarFlat(
        startTemp,
        targetTemp,
        extendedGraph.nodeCol,
        extendedGraph.nodeRow,
        extendedGraph.edgeOffsets,
        extendedGraph.edgeTargets,
        extendedGraph.edgeCosts,
        extendedGraph.nodeCount,
        searchState.prepare(),
    );
    writeAbstractPath(slot, abstractPath);
    if (!abstractPath) {
        writeCellPath(slot, null);
        return buildReplanResult(slot);
    }
    const resolveRegionLeg = (aIdx, bIdx) => localAStar(baseGraph.nodeCol[aIdx], baseGraph.nodeRow[aIdx], baseGraph.nodeCol[bIdx], baseGraph.nodeRow[bIdx], prep.regionConnectMaxLen);
    const cellPath = stitchAbstractCellPath(abstractPath, prep, tempLegs, resolveRegionLeg);
    writeCellPath(slot, cellPath);
    return buildReplanResult(slot);
}
self.onmessage = function (e) {
    const { type, data, slot, requestId } = e.data;
    if (type === "init") {
        maxSlots = data.maxSlots;
        maxPathLen = data.maxPathLen;
        maxAbstractLen = data.maxAbstractLen;
        maxGraphNodes = data.maxGraphNodes;
        maxGraphEdges = data.maxGraphEdges;
        maxCellsPerChunk = data.maxCellsPerChunk;
        minCellsPerChunk = data.minCellsPerChunk;
        sabPathMetaPool = data.sabPathMetaPool;
        sabPathColsPool = data.sabPathColsPool;
        sabPathRowsPool = data.sabPathRowsPool;
        sabAbstractIdxPool = data.sabAbstractIdxPool;
        sabPersistGraphNodeCol = data.sabPersistGraphNodeCol;
        sabPersistGraphNodeRow = data.sabPersistGraphNodeRow;
        sabPersistGraphEdgeOffsets = data.sabPersistGraphEdgeOffsets;
        sabPersistGraphEdgeTargets = data.sabPersistGraphEdgeTargets;
        sabPersistGraphEdgeCosts = data.sabPersistGraphEdgeCosts;
        sabPersistGraphEdgeSources = data.sabPersistGraphEdgeSources;
        sabCellToRegionIdx = data.sabCellToRegionIdx;
        return;
    }
    if (type === "buildNavTopology") {
        buildNavTopologyOnWorker(e.data);
        self.postMessage({ type: "syncNavDone" });
        return;
    }
    if (type === "buildRegionGraphFull") {
        if (e.data.sabCellToRegionIdx) sabCellToRegionIdx = e.data.sabCellToRegionIdx;
        runGraphPatch(() => buildRegionGraphFullOnWorker(e.data));
        return;
    }
    if (type === "patchRegionGraph") {
        if (e.data.sabCellToRegionIdx) sabCellToRegionIdx = e.data.sabCellToRegionIdx;
        runGraphPatch(() => patchRegionGraphOnWorker(e.data));
        return;
    }
    if (type === "replan") {
        const replanResult = runReplan(slot, e.data);
        self.postMessage({ type: "hpaDone", slot, requestId, replanResult });
    }
};
