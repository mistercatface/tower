import { runLocalAStarFlat, runAbstractAStarFlat } from "../../Libraries/Pathfinding/AStar.js";
import { createSnapshotLocalNavView, buildOctileNeighborsFromTopology } from "../../Libraries/Pathfinding/GridNavSnapshot.js";
let maxSlots;
let maxPathLen;
let maxAbstractLen;
let maxGraphNodes;
let maxGraphEdges;
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
const MAX_TEMP_LEGS = 16;
let sabReplanLegMetaPool;
function slotReplanLegMeta(slot) {
    return new Int32Array(sabReplanLegMetaPool, slot * 32 * 4, 32);
}
let extNodeCol;
let extNodeRow;
let extEdgeOffsets;
let extEdgeTargets;
let extEdgeCosts;
function slotPathMeta(slot) {
    return new Int32Array(sabPathMetaPool, slot * 8, 2);
}
function slotPathCols(slot) {
    return new Int16Array(sabPathColsPool, slot * maxPathLen * 2, maxPathLen);
}
function slotPathRows(slot) {
    return new Int16Array(sabPathRowsPool, slot * maxPathLen * 2, maxPathLen);
}
function slotAbstractIdx(slot) {
    return new Int16Array(sabAbstractIdxPool, slot * maxAbstractLen * 2, maxAbstractLen);
}
function persistNodeColView() {
    return new Int16Array(sabPersistGraphNodeCol, 0, maxGraphNodes);
}
function persistNodeRowView() {
    return new Int16Array(sabPersistGraphNodeRow, 0, maxGraphNodes);
}
function persistEdgeOffsetsView() {
    return new Int32Array(sabPersistGraphEdgeOffsets, 0, maxGraphNodes + 1);
}
function persistEdgeTargetsView() {
    return new Int16Array(sabPersistGraphEdgeTargets, 0, maxGraphEdges);
}
function persistEdgeCostsView() {
    return new Uint16Array(sabPersistGraphEdgeCosts, 0, maxGraphEdges);
}
function persistEdgeSourcesView() {
    return new Int16Array(sabPersistGraphEdgeSources, 0, maxGraphEdges);
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
    const size = cols * rows;
    const blocked = new Uint8Array(data.sabBlocked);
    const cardinalOpen = new Uint8Array(data.sabCardinalOpen);
    const vertexPassability = new Uint8Array(data.sabVertexPassability);
    const octileNeighbors = new Int32Array(data.sabOctileNeighbors);
    buildOctileNeighborsFromTopology(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors);
    bindNavFromBuild({ ...data, sabBlocked: data.sabBlocked, sabOctileNeighbors: data.sabOctileNeighbors });
}
function buildPersistGraphCsr(nodeCount, edgeWrite) {
    const srcSources = persistEdgeSourcesView().subarray(0, edgeWrite);
    const edgeOffsets = persistEdgeOffsetsView();
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
function writeCellPath(slot, path) {
    const pathMeta = slotPathMeta(slot);
    pathMeta[0] = path ? path.length : 0;
    if (!path) return;
    const pathCols = slotPathCols(slot);
    const pathRows = slotPathRows(slot);
    for (let i = 0; i < path.length; i++) {
        pathCols[i] = path[i].col;
        pathRows[i] = path[i].row;
    }
}
function writeAbstractPath(slot, pathIdx) {
    const pathMeta = slotPathMeta(slot);
    pathMeta[1] = pathIdx ? pathIdx.length : 0;
    if (!pathIdx) return;
    const abstractIdx = slotAbstractIdx(slot);
    for (let i = 0; i < pathIdx.length; i++) abstractIdx[i] = pathIdx[i];
}
function appendCellLeg(fullPath, leg) {
    if (!leg) return fullPath;
    if (!fullPath) return leg.slice();
    fullPath.push(...leg.slice(1));
    return fullPath;
}
function writeTempLegs(slot, tempLegs) {
    const meta = slotReplanLegMeta(slot);
    const pathCols = slotPathCols(slot);
    const pathRows = slotPathRows(slot);
    let legCount = 0;
    let cellOffset = 0;
    for (const [key, path] of tempLegs) {
        if (legCount >= MAX_TEMP_LEGS) break;
        const [from, to] = key.split(",").map(Number);
        const base = 1 + legCount * 4;
        meta[base] = from;
        meta[base + 1] = to;
        meta[base + 2] = path.length;
        meta[base + 3] = cellOffset;
        for (let i = 0; i < path.length; i++) {
            pathCols[cellOffset + i] = path[i].col;
            pathRows[cellOffset + i] = path[i].row;
        }
        cellOffset += path.length;
        legCount++;
    }
    meta[0] = legCount;
}
function buildExtendedEdges(nodeCount, edgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates, regionConnectMaxLen) {
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const extCount = nodeCount + 2;
    const baseCol = persistNodeColView().subarray(0, nodeCount);
    const baseRow = persistNodeRowView().subarray(0, nodeCount);
    const baseOffsets = persistEdgeOffsetsView().subarray(0, nodeCount + 1);
    const baseTargets = persistEdgeTargetsView().subarray(0, edgeWrite);
    const baseCosts = persistEdgeCostsView().subarray(0, edgeWrite);
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
function runReplan(slot, data) {
    const { mode, startCol, startRow, targetCol, targetRow, localMaxLen } = data;
    if (mode === "local") {
        const path = runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navView, cols, rows, localMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        writeCellPath(slot, path);
        writeAbstractPath(slot, null);
        return;
    }
    const { startCandidates, targetCandidates, regionConnectMaxLen } = data;
    const extended = buildExtendedEdges(persistNodeCount, persistEdgeWrite, startCol, startRow, targetCol, targetRow, startCandidates, targetCandidates, regionConnectMaxLen);
    writeTempLegs(slot, extended.tempLegs);
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
    writeCellPath(slot, null);
}
self.onmessage = function (e) {
    const { type, data, slot, requestId } = e.data;
    if (type === "init") {
        maxSlots = data.maxSlots;
        maxPathLen = data.maxPathLen;
        maxAbstractLen = data.maxAbstractLen;
        maxGraphNodes = data.maxGraphNodes;
        maxGraphEdges = data.maxGraphEdges;
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
        sabReplanLegMetaPool = data.sabReplanLegMetaPool;
        return;
    }
    if (type === "buildNavSnapshot") {
        buildNavSnapshotOnWorker(e.data);
        self.postMessage({ type: "syncNavDone" });
        return;
    }
    if (type === "syncAbstractGraph") {
        syncPersistAbstractGraph(e.data.nodeCount, e.data.edgeWrite);
        self.postMessage({ type: "graphSyncDone" });
        return;
    }
    if (type === "replan") {
        runReplan(slot, e.data);
        self.postMessage({ type: "hpaDone", slot, requestId });
    }
};
