import { runLocalAStarFlat, runAbstractAStarFlat } from "../../Libraries/Pathfinding/AStar.js";
import { createSnapshotLocalNavView } from "../../Libraries/Pathfinding/GridNavSnapshot.js";
let maxSlots;
let maxPathLen;
let maxAbstractLen;
let maxGraphNodes;
let maxGraphEdges;
let sabPathMetaPool;
let sabPathColsPool;
let sabPathRowsPool;
let sabAbstractIdxPool;
let sabGraphNodeColPool;
let sabGraphNodeRowPool;
let sabGraphEdgeOffsetsPool;
let sabGraphEdgeTargetsPool;
let sabGraphEdgeCostsPool;
let navSnapshot;
let navView;
let cols;
let rows;
let aStarGScore;
let aStarCameFrom;
let aStarVisited;
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
function slotGraphNodeCol(slot) {
    return new Int16Array(sabGraphNodeColPool, slot * maxGraphNodes * 2, maxGraphNodes);
}
function slotGraphNodeRow(slot) {
    return new Int16Array(sabGraphNodeRowPool, slot * maxGraphNodes * 2, maxGraphNodes);
}
function slotGraphEdgeOffsets(slot) {
    return new Int32Array(sabGraphEdgeOffsetsPool, slot * (maxGraphNodes + 1) * 4, maxGraphNodes + 1);
}
function slotGraphEdgeTargets(slot) {
    return new Int16Array(sabGraphEdgeTargetsPool, slot * maxGraphEdges * 2, maxGraphEdges);
}
function slotGraphEdgeCosts(slot) {
    return new Uint16Array(sabGraphEdgeCostsPool, slot * maxGraphEdges * 2, maxGraphEdges);
}
function bindNavBuffers(data) {
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
self.onmessage = function (e) {
    const { type, data, slot, requestId, startCol, startRow, targetCol, targetRow, maxPathLen: maxLen, runId, startIdx, targetIdx, nodeCount, edgeWrite } = e.data;
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
        sabGraphNodeColPool = data.sabGraphNodeColPool;
        sabGraphNodeRowPool = data.sabGraphNodeRowPool;
        sabGraphEdgeOffsetsPool = data.sabGraphEdgeOffsetsPool;
        sabGraphEdgeTargetsPool = data.sabGraphEdgeTargetsPool;
        sabGraphEdgeCostsPool = data.sabGraphEdgeCostsPool;
        return;
    }
    if (type === "syncNav") {
        bindNavBuffers(e.data);
        self.postMessage({ type: "syncNavDone" });
        return;
    }
    if (type === "localAStar") {
        const path = runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navView, cols, rows, maxLen, aStarGScore, aStarCameFrom, aStarVisited, runId);
        writeCellPath(slot, path);
        slotPathMeta(slot)[1] = 0;
        self.postMessage({ type: "hpaDone", slot, requestId });
        return;
    }
    if (type === "abstractAStar") {
        const pathIdx = runAbstractAStarFlat(
            startIdx,
            targetIdx,
            slotGraphNodeCol(slot).subarray(0, nodeCount),
            slotGraphNodeRow(slot).subarray(0, nodeCount),
            slotGraphEdgeOffsets(slot).subarray(0, nodeCount + 1),
            slotGraphEdgeTargets(slot).subarray(0, edgeWrite),
            slotGraphEdgeCosts(slot).subarray(0, edgeWrite),
            nodeCount,
        );
        writeAbstractPath(slot, pathIdx);
        slotPathMeta(slot)[0] = 0;
        self.postMessage({ type: "hpaDone", slot, requestId });
    }
};
