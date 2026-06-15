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
    const srcTargets = persistEdgeTargetsView().subarray(0, edgeWrite);
    const srcCosts = persistEdgeCostsView().subarray(0, edgeWrite);
    const edgeOffsets = persistEdgeOffsetsView();
    const outTargets = persistEdgeTargetsView();
    const outCosts = persistEdgeCostsView();
    let write = 0;
    for (let i = 0; i < nodeCount; i++) {
        edgeOffsets[i] = write;
        for (let e = 0; e < edgeWrite; e++) {
            if (srcSources[e] !== i) continue;
            outTargets[write] = srcTargets[e];
            outCosts[write] = srcCosts[e];
            write++;
        }
    }
    edgeOffsets[nodeCount] = write;
    return write;
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
    const extra = [];
    for (let i = 0; i < nodeCount; i++) for (let e = baseOffsets[i]; e < baseOffsets[i + 1]; e++) extra.push([i, baseTargets[e], baseCosts[e]]);
    for (let i = 0; i < startCandidates.length; i++) {
        const cIdx = startCandidates[i];
        const path = runLocalAStarFlat(startCol, startRow, extNodeCol[cIdx], extNodeRow[cIdx], navView, cols, rows, regionConnectMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        if (path) extra.push([startTemp, cIdx, path.length]);
    }
    for (let i = 0; i < targetCandidates.length; i++) {
        const cIdx = targetCandidates[i];
        const path = runLocalAStarFlat(extNodeCol[cIdx], extNodeRow[cIdx], targetCol, targetRow, navView, cols, rows, regionConnectMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        if (path) extra.push([cIdx, targetTemp, path.length]);
    }
    let write = 0;
    for (let i = 0; i < extCount; i++) {
        extEdgeOffsets[i] = write;
        for (let e = 0; e < extra.length; e++) {
            if (extra[e][0] !== i) continue;
            extEdgeTargets[write] = extra[e][1];
            extEdgeCosts[write] = extra[e][2];
            write++;
        }
    }
    extEdgeOffsets[extCount] = write;
    return { extCount, startTemp, targetTemp, edgeWrite: write };
}
function stitchIdxPath(abstractPath, nodeCol, nodeRow, stitchMaxLen) {
    let fullPath = null;
    for (let i = 0; i < abstractPath.length - 1; i++) {
        const aCol = nodeCol[abstractPath[i]];
        const aRow = nodeRow[abstractPath[i]];
        const bCol = nodeCol[abstractPath[i + 1]];
        const bRow = nodeRow[abstractPath[i + 1]];
        const leg = runLocalAStarFlat(aCol, aRow, bCol, bRow, navView, cols, rows, stitchMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        if (!leg) {
            if (!fullPath) fullPath = [{ col: aCol, row: aRow }];
            fullPath.push({ col: bCol, row: bRow });
            continue;
        }
        fullPath = appendCellLeg(fullPath, leg);
    }
    return fullPath;
}
function runReplan(slot, data) {
    const { mode, startCol, startRow, targetCol, targetRow, localMaxLen } = data;
    if (mode === "local") {
        const path = runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navView, cols, rows, localMaxLen, aStarGScore, aStarCameFrom, aStarVisited, ++replanRunId);
        writeCellPath(slot, path);
        writeAbstractPath(slot, null);
        return;
    }
    const { startCandidates, targetCandidates, regionConnectMaxLen, stitchMaxLen } = data;
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
        return;
    }
    writeCellPath(slot, stitchIdxPath(abstractPath, extNodeCol, extNodeRow, stitchMaxLen));
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
