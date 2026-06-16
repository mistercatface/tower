import { runLocalAStarFlat, runAbstractAStarFlat } from "../../Libraries/Pathfinding/AStar.js";
import { createSnapshotLocalNavView, buildOctileNeighborsFromTopology } from "../../Libraries/Pathfinding/GridNavSnapshot.js";
import { createNavSimView, bindNavSimEdgePool, bindNavSimGridFrame } from "../../Libraries/Pathfinding/navSimView.js";
import { bindNavEdgePoolFromSab } from "../../Libraries/Spatial/grid/navEdgePoolSab.js";
import { recomputeVertexPassabilityInto, recomputeNavCardinalOpenInto } from "../../Libraries/Spatial/grid/vertexPassability.js";
import { stitchAbstractCellPath } from "../../Libraries/Pathfinding/hpaStitch.js";
import { collectPersistTempConnectCandidates, nearestRegionNodeIdx } from "../../Libraries/Pathfinding/hpaReplanPrep.js";
import { prepareHpaReplanPrep } from "../../Libraries/Pathfinding/hpaPathRequest.js";
import { buildFullRegionGraph, packRegionGraphFlat, rebuildDamagedRegionGraph } from "../../Libraries/Pathfinding/hpaRegionGraph.js";
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
} from "../../Libraries/Pathfinding/hpaWorkerSab.js";
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
let navSnapshot;
let navView;
let cols;
let rows;
let aStarGScore;
let aStarCameFrom;
let aStarVisited;
let replanRunId = 0;
let persistNodeCount = 0;
let persistEdgeWrite = 0;
/** @type {string[]} */
let persistNodeIds = [];
let extNodeCol;
let extNodeRow;
let extEdgeOffsets;
let extEdgeTargets;
let extEdgeCosts;
let minX;
let minY;
let cellSize;
/** @type {{ cols: number, rows: number, minX: number, minY: number, cellSize: number, key: string } | null} */
let workerGridFrame = null;
let damagePadding;
let pruneSeedWorldX;
let pruneSeedWorldY;
/** @type {ReturnType<typeof createNavSimView> | null} */
let navSimView = null;
/** @type {{ nodesMap: Record<string, object>, cellToNode: Array<object | null>, nodeIdCounter: number, distToWall: Float32Array | null, blocked: Uint8Array, cols: number, rows: number, minX: number, minY: number, cellSize: number, navGraph: object, maxCellsPerChunk: number, minCellsPerChunk: number, damagePadding: number, seedWorldX: number | null, seedWorldY: number | null } | null} */
let regionGraphState = null;
function applyWorkerGridFrame(data) {
    if (data.minX !== undefined) {
        workerGridFrame = { cols: data.cols, rows: data.rows, minX: data.minX, minY: data.minY, cellSize: data.cellSize, key: data.gridFrameKey };
        cols = data.cols;
        rows = data.rows;
        minX = data.minX;
        minY = data.minY;
        cellSize = data.cellSize;
        if (navSimView) {
            navSimView.cols = data.cols;
            navSimView.rows = data.rows;
            bindNavSimGridFrame(navSimView, data.minX, data.minY, data.cellSize);
        }
        return;
    }
    if (!workerGridFrame || data.gridFrameKey !== workerGridFrame.key) throw new Error(`nav sync missing grid frame (key=${data.gridFrameKey ?? ""})`);
    if (data.cols !== workerGridFrame.cols || data.rows !== workerGridFrame.rows) throw new Error("nav sync grid size changed without grid frame rebinding");
}
function ensureNavSimView(data) {
    applyWorkerGridFrame(data);
    const edgePool = bindNavEdgePoolFromSab(new Uint8Array(data.sabEdgePool), data.edgePoolCount);
    const cardinalOpen = new Uint8Array(data.sabCardinalOpen);
    const vertexPassability = new Uint8Array(data.sabVertexPassability);
    if (!navSimView)
        navSimView = createNavSimView(
            workerGridFrame.cols,
            workerGridFrame.rows,
            new Uint8Array(data.sabGridFill),
            new Uint8Array(data.sabFloorKind),
            new Uint8Array(data.sabFloorFacing),
            new Int32Array(data.sabEdgeSlots),
            edgePool,
            data.passageEdgeCount,
            vertexPassability,
            workerGridFrame.minX,
            workerGridFrame.minY,
            workerGridFrame.cellSize,
        );
    else {
        bindNavSimEdgePool(navSimView, edgePool, data.passageEdgeCount);
        navSimView.vertexPassability = vertexPassability;
    }
    return { simView: navSimView, cardinalOpen, vertexPassability };
}
function bakeNavTopologyFull(data) {
    const baked = ensureNavSimView(data);
    recomputeVertexPassabilityInto(baked.simView, baked.vertexPassability);
    recomputeNavCardinalOpenInto(baked.simView, baked.cardinalOpen);
    return baked;
}
function bindNavFromBuild(data) {
    cols = data.cols;
    rows = data.rows;
    const size = cols * rows;
    navSnapshot = {
        cols,
        rows,
        blocked: new Uint8Array(data.sabBlocked),
        octileNeighbors: new Int32Array(data.sabOctileNeighbors),
        hopOffsets: new Int32Array(data.sabHopOffsets),
        hopExitIdx: new Int32Array(data.sabHopExitIdx),
        hopCost: new Uint8Array(data.sabHopCost),
    };
    navView = createSnapshotLocalNavView(navSnapshot);
    if (!aStarGScore || aStarGScore.length !== size) {
        aStarGScore = new Float32Array(size);
        aStarCameFrom = new Int32Array(size);
        aStarVisited = new Int32Array(size);
    }
}
function buildNavSnapshotOnWorker(data) {
    cols = data.cols;
    rows = data.rows;
    const blocked = new Uint8Array(data.sabBlocked);
    const octileNeighbors = new Int32Array(data.sabOctileNeighbors);
    const baked = bakeNavTopologyFull(data);
    buildOctileNeighborsFromTopology(blocked, baked.cardinalOpen, baked.vertexPassability, cols, rows, octileNeighbors);
    bindNavFromBuild({ ...data, sabBlocked: data.sabBlocked, sabOctileNeighbors: data.sabOctileNeighbors });
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
function writeRegionGraphToSab(expectedCols, expectedRows) {
    if (!regionGraphState) return null;
    if (expectedCols !== cols || expectedRows !== rows) throw new Error(`HPA region graph size mismatch: nav ${cols}x${rows}, graph ${expectedCols}x${expectedRows}`);
    const packed = packRegionGraphFlat(regionGraphState.nodesMap, regionGraphState.cellToNode, cols, rows);
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
    hpaCellToRegionView(sabCellToRegionIdx, cols * rows).set(packed.cellToRegion);
    syncPersistAbstractGraph(packed.nodeCount, packed.edgeWrite);
    persistNodeIds = packed.nodeIds;
    return { nodeCount: packed.nodeCount, edgeWrite: packed.edgeWrite, nodeIds: packed.nodeIds };
}
function buildRegionGraphFullOnWorker(data) {
    if (!navSnapshot) throw new Error("buildRegionGraphFull requires nav snapshot");
    if (data.cols !== cols || data.rows !== rows) throw new Error(`buildRegionGraphFull cols/rows mismatch: nav ${cols}x${rows}, request ${data.cols}x${data.rows}`);
    minX = data.minX;
    minY = data.minY;
    cellSize = data.cellSize;
    damagePadding = data.damagePadding;
    pruneSeedWorldX = data.seedWorldX;
    pruneSeedWorldY = data.seedWorldY;
    const built = buildFullRegionGraph({
        blocked: navSnapshot.blocked,
        cols,
        rows,
        minX,
        minY,
        cellSize,
        navGraph: navView,
        maxCellsPerChunk,
        minCellsPerChunk: data.minCellsPerChunk ?? minCellsPerChunk,
        seedWorldX: data.seedWorldX,
        seedWorldY: data.seedWorldY,
    });
    regionGraphState = {
        ...built,
        blocked: navSnapshot.blocked,
        cols,
        rows,
        minX,
        minY,
        cellSize,
        navGraph: navView,
        maxCellsPerChunk,
        minCellsPerChunk: data.minCellsPerChunk ?? minCellsPerChunk,
        damagePadding,
        seedWorldX: data.seedWorldX,
        seedWorldY: data.seedWorldY,
        distToWall: null,
    };
    return writeRegionGraphToSab(data.cols, data.rows);
}
function patchRegionGraphOnWorker(data) {
    if (!navSnapshot || !regionGraphState) throw new Error("patchRegionGraph requires nav snapshot and region graph");
    if (data.cols !== cols || data.rows !== rows) throw new Error(`patchRegionGraph cols/rows mismatch: nav ${cols}x${rows}, request ${data.cols}x${data.rows}`);
    regionGraphState.blocked = navSnapshot.blocked;
    regionGraphState.navGraph = navView;
    regionGraphState.seedWorldX = data.seedWorldX ?? pruneSeedWorldX;
    regionGraphState.seedWorldY = data.seedWorldY ?? pruneSeedWorldY;
    rebuildDamagedRegionGraph(regionGraphState, { startCol: data.startCol, endCol: data.endCol, startRow: data.startRow, endRow: data.endRow });
    return writeRegionGraphToSab(data.cols, data.rows);
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
function octileGridCost(fromCol, fromRow, toCol, toRow) {
    return Math.max(Math.abs(toCol - fromCol), Math.abs(toRow - fromRow));
}
/** Temp-connect costs from octile distance only — for fast abstract-first estimate. */
function buildExtendedEdgesEstimate(nodeCount, edgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates) {
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const extCount = nodeCount + 2;
    const baseCol = hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes).subarray(0, nodeCount);
    const baseRow = hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes).subarray(0, nodeCount);
    const baseOffsets = hpaPersistEdgeOffsetsView(sabPersistGraphEdgeOffsets, maxGraphNodes).subarray(0, nodeCount + 1);
    const baseTargets = hpaPersistEdgeTargetsView(sabPersistGraphEdgeTargets, maxGraphEdges).subarray(0, edgeWrite);
    const baseCosts = hpaPersistEdgeCostsView(sabPersistGraphEdgeCosts, maxGraphEdges).subarray(0, edgeWrite);
    if (!extNodeCol || extNodeCol.length < extCount) {
        extNodeCol = new Int16Array(maxGraphNodes + 2);
        extNodeRow = new Int16Array(maxGraphNodes + 2);
        extEdgeOffsets = new Int32Array(maxGraphNodes + 3);
        extEdgeTargets = new Int16Array(maxGraphEdges + 64);
        extEdgeCosts = new Uint16Array(maxGraphEdges + 64);
    }
    extNodeCol.set(baseCol);
    extNodeRow.set(baseRow);
    extNodeCol[startTemp] = startCol;
    extNodeRow[startTemp] = startRow;
    extNodeCol[targetTemp] = targetCol;
    extNodeRow[targetTemp] = targetRow;
    const targetConnectCost = new Int32Array(nodeCount);
    for (let i = 0; i < targetCandidates.length; i++) {
        const cIdx = targetCandidates[i];
        const cost = octileGridCost(extNodeCol[cIdx], extNodeRow[cIdx], targetCol, targetRow);
        if (cost > 0) targetConnectCost[cIdx] = cost;
    }
    const startEdges = [];
    for (let i = 0; i < startCandidates.length; i++) {
        const cIdx = startCandidates[i];
        const cost = octileGridCost(startCol, startRow, extNodeCol[cIdx], extNodeRow[cIdx]);
        if (cost > 0) startEdges.push({ targetIdx: cIdx, cost });
    }
    extEdgeOffsets[0] = 0;
    for (let i = 0; i < nodeCount; i++) {
        const baseCount = baseOffsets[i + 1] - baseOffsets[i];
        const extraCount = targetConnectCost[i] > 0 ? 1 : 0;
        extEdgeOffsets[i + 1] = extEdgeOffsets[i] + baseCount + extraCount;
    }
    extEdgeOffsets[startTemp + 1] = extEdgeOffsets[startTemp] + startEdges.length;
    extEdgeOffsets[targetTemp + 1] = extEdgeOffsets[targetTemp];
    for (let i = 0; i < nodeCount; i++) {
        let write = extEdgeOffsets[i];
        const baseStart = baseOffsets[i];
        const baseEnd = baseOffsets[i + 1];
        for (let e = baseStart; e < baseEnd; e++) {
            extEdgeTargets[write] = baseTargets[e];
            extEdgeCosts[write] = baseCosts[e];
            write++;
        }
        if (targetConnectCost[i] > 0) {
            extEdgeTargets[write] = targetTemp;
            extEdgeCosts[write] = targetConnectCost[i];
            write++;
        }
    }
    let startWrite = extEdgeOffsets[startTemp];
    for (let i = 0; i < startEdges.length; i++) {
        extEdgeTargets[startWrite] = startEdges[i].targetIdx;
        extEdgeCosts[startWrite] = startEdges[i].cost;
        startWrite++;
    }
    const totalEdges = extEdgeOffsets[extCount];
    return { extCount, startTemp, targetTemp, edgeWrite: totalEdges };
}
function buildExtendedEdges(nodeCount, edgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates, regionConnectMaxLen) {
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const extCount = nodeCount + 2;
    const baseCol = hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes).subarray(0, nodeCount);
    const baseRow = hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes).subarray(0, nodeCount);
    const baseOffsets = hpaPersistEdgeOffsetsView(sabPersistGraphEdgeOffsets, maxGraphNodes).subarray(0, nodeCount + 1);
    const baseTargets = hpaPersistEdgeTargetsView(sabPersistGraphEdgeTargets, maxGraphEdges).subarray(0, edgeWrite);
    const baseCosts = hpaPersistEdgeCostsView(sabPersistGraphEdgeCosts, maxGraphEdges).subarray(0, edgeWrite);
    if (!extNodeCol || extNodeCol.length < extCount) {
        extNodeCol = new Int16Array(maxGraphNodes + 2);
        extNodeRow = new Int16Array(maxGraphNodes + 2);
        extEdgeOffsets = new Int32Array(maxGraphNodes + 3);
        extEdgeTargets = new Int16Array(maxGraphEdges + 64);
        extEdgeCosts = new Uint16Array(maxGraphEdges + 64);
    }
    extNodeCol.set(baseCol);
    extNodeRow.set(baseRow);
    extNodeCol[startTemp] = startCol;
    extNodeRow[startTemp] = startRow;
    extNodeCol[targetTemp] = targetCol;
    extNodeRow[targetTemp] = targetRow;
    const tempLegs = new Map();
    const targetConnectCost = new Int32Array(nodeCount);
    for (let i = 0; i < targetCandidates.length; i++) {
        const cIdx = targetCandidates[i];
        const path = runLocalAStarFlat(extNodeCol[cIdx], extNodeRow[cIdx], targetCol, targetRow, navView, cols, rows, regionConnectMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        if (path) {
            targetConnectCost[cIdx] = path.length;
            tempLegs.set(`${cIdx},${targetTemp}`, path);
        }
    }
    const startEdges = [];
    for (let i = 0; i < startCandidates.length; i++) {
        const cIdx = startCandidates[i];
        const path = runLocalAStarFlat(startCol, startRow, extNodeCol[cIdx], extNodeRow[cIdx], navView, cols, rows, regionConnectMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        if (path) {
            startEdges.push({ targetIdx: cIdx, cost: path.length });
            tempLegs.set(`${startTemp},${cIdx}`, path);
        }
    }
    // prefix-sum: calculate offsets
    extEdgeOffsets[0] = 0;
    for (let i = 0; i < nodeCount; i++) {
        const baseCount = baseOffsets[i + 1] - baseOffsets[i];
        const extraCount = targetConnectCost[i] > 0 ? 1 : 0;
        extEdgeOffsets[i + 1] = extEdgeOffsets[i] + baseCount + extraCount;
    }
    extEdgeOffsets[startTemp + 1] = extEdgeOffsets[startTemp] + startEdges.length;
    extEdgeOffsets[targetTemp + 1] = extEdgeOffsets[targetTemp];
    // populate edges
    for (let i = 0; i < nodeCount; i++) {
        let write = extEdgeOffsets[i];
        const baseStart = baseOffsets[i];
        const baseEnd = baseOffsets[i + 1];
        for (let e = baseStart; e < baseEnd; e++) {
            extEdgeTargets[write] = baseTargets[e];
            extEdgeCosts[write] = baseCosts[e];
            write++;
        }
        if (targetConnectCost[i] > 0) {
            extEdgeTargets[write] = targetTemp;
            extEdgeCosts[write] = targetConnectCost[i];
            write++;
        }
    }
    let startWrite = extEdgeOffsets[startTemp];
    for (let i = 0; i < startEdges.length; i++) {
        const edge = startEdges[i];
        extEdgeTargets[startWrite] = edge.targetIdx;
        extEdgeCosts[startWrite] = edge.cost;
        startWrite++;
    }
    const totalEdges = extEdgeOffsets[extCount];
    return { extCount, startTemp, targetTemp, edgeWrite: totalEdges, tempLegs };
}
function collectReplanTempCandidates(startCol, startRow, targetCol, targetRow) {
    const nodeCol = hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes).subarray(0, persistNodeCount);
    const nodeRow = hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes).subarray(0, persistNodeCount);
    const edgeOffsets = hpaPersistEdgeOffsetsView(sabPersistGraphEdgeOffsets, maxGraphNodes).subarray(0, persistNodeCount + 1);
    const edgeTargets = hpaPersistEdgeTargetsView(sabPersistGraphEdgeTargets, maxGraphEdges).subarray(0, persistEdgeWrite);
    const startRegionIdx = nearestRegionNodeIdx(nodeCol, nodeRow, persistNodeCount, startCol, startRow);
    const targetRegionIdx = nearestRegionNodeIdx(nodeCol, nodeRow, persistNodeCount, targetCol, targetRow);
    const startCandidates = collectPersistTempConnectCandidates({
        gridCol: startCol,
        gridRow: startRow,
        isStart: true,
        anchorRegionIdx: startRegionIdx,
        nodeCol,
        nodeRow,
        nodeCount: persistNodeCount,
        edgeOffsets,
        edgeTargets,
        maxCellsPerChunk,
    });
    const targetCandidates = collectPersistTempConnectCandidates({
        gridCol: targetCol,
        gridRow: targetRow,
        isStart: false,
        anchorRegionIdx: targetRegionIdx,
        nodeCol,
        nodeRow,
        nodeCount: persistNodeCount,
        edgeOffsets,
        edgeTargets,
        maxCellsPerChunk,
    });
    return { startCandidates, targetCandidates };
}
function runReplan(slot, data, requestId) {
    const { startCol, startRow, targetCol, targetRow, localMaxLen, regionConnectMaxLen } = data;
    const cellToRegion = hpaCellToRegionView(sabCellToRegionIdx, cols * rows);
    const nodeCol = hpaPersistNodeColView(sabPersistGraphNodeCol, maxGraphNodes).subarray(0, persistNodeCount);
    const nodeRow = hpaPersistNodeRowView(sabPersistGraphNodeRow, maxGraphNodes).subarray(0, persistNodeCount);
    const prep = prepareHpaReplanPrep(cols, cellToRegion, { nodeCount: persistNodeCount, nodeIds: persistNodeIds, nodeCol, nodeRow }, startCol, startRow, targetCol, targetRow);
    if (prep.mode === "local") {
        const path = runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navView, cols, rows, localMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        writeCellPath(slot, path);
        writeAbstractPath(slot, null);
        return prep.mode;
    }
    const { startCandidates, targetCandidates } = collectReplanTempCandidates(startCol, startRow, targetCol, targetRow);
    const estimated = buildExtendedEdgesEstimate(persistNodeCount, persistEdgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates);
    const estimateAbstract = runAbstractAStarFlat(
        estimated.startTemp,
        estimated.targetTemp,
        extNodeCol.subarray(0, estimated.extCount),
        extNodeRow.subarray(0, estimated.extCount),
        extEdgeOffsets.subarray(0, estimated.extCount + 1),
        extEdgeTargets.subarray(0, estimated.edgeWrite),
        extEdgeCosts.subarray(0, estimated.edgeWrite),
        estimated.extCount,
    );
    writeAbstractPath(slot, estimateAbstract);
    self.postMessage({ type: "abstractReady", slot, requestId });
    const extended = buildExtendedEdges(persistNodeCount, persistEdgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates, regionConnectMaxLen);
    const abstractPath = runAbstractAStarFlat(
        extended.startTemp,
        extended.targetTemp,
        extNodeCol.subarray(0, extended.extCount),
        extNodeRow.subarray(0, extended.extCount),
        extEdgeOffsets.subarray(0, extended.extCount + 1),
        extEdgeTargets.subarray(0, extended.edgeWrite),
        extEdgeCosts.subarray(0, extended.edgeWrite),
        extended.extCount,
    );
    writeAbstractPath(slot, abstractPath);
    if (!abstractPath) {
        writeCellPath(slot, null);
        return prep.mode;
    }
    const stitchPrep = { startCol, startRow, targetCol, targetRow, nodeCount: persistNodeCount, nodeCol, nodeRow };
    const resolveRegionLeg = (aIdx, bIdx) =>
        runLocalAStarFlat(nodeCol[aIdx], nodeRow[aIdx], nodeCol[bIdx], nodeRow[bIdx], navView, cols, rows, regionConnectMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
    const cellPath = stitchAbstractCellPath(abstractPath, stitchPrep, extended.tempLegs, resolveRegionLeg);
    writeCellPath(slot, cellPath);
    return prep.mode;
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
    if (type === "buildNavSnapshot") {
        buildNavSnapshotOnWorker(e.data);
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
        const replanMode = runReplan(slot, e.data, requestId);
        self.postMessage({ type: "hpaDone", slot, requestId, replanMode });
    }
};
