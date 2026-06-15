import { runLocalAStarFlat, runAbstractAStarFlat } from "../../Libraries/Pathfinding/AStar.js";
import { createSnapshotLocalNavView } from "../../Libraries/Pathfinding/GridNavSnapshot.js";
let pathMeta;
let pathCols;
let pathRows;
let abstractIdx;
let graphNodeCol;
let graphNodeRow;
let graphEdgeOffsets;
let graphEdgeTargets;
let graphEdgeCosts;
let maxPathLen;
let maxAbstractLen;
let navSnapshot;
let navView;
let cols;
let rows;
let aStarGScore;
let aStarCameFrom;
let aStarVisited;
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
function writeCellPath(path) {
    pathMeta[0] = path ? path.length : 0;
    if (!path) return;
    for (let i = 0; i < path.length; i++) {
        pathCols[i] = path[i].col;
        pathRows[i] = path[i].row;
    }
}
function writeAbstractPath(pathIdx) {
    pathMeta[1] = pathIdx ? pathIdx.length : 0;
    if (!pathIdx) return;
    for (let i = 0; i < pathIdx.length; i++) abstractIdx[i] = pathIdx[i];
}
self.onmessage = function (e) {
    const { type, data, slot, requestId, startCol, startRow, targetCol, targetRow, maxPathLen: maxLen, runId, startIdx, targetIdx, nodeCount, edgeWrite } = e.data;
    if (type === "init") {
        pathMeta = new Int32Array(data.sabPathMeta);
        pathCols = new Int16Array(data.sabPathCols);
        pathRows = new Int16Array(data.sabPathRows);
        abstractIdx = new Int16Array(data.sabAbstractIdx);
        graphNodeCol = new Int16Array(data.sabGraphNodeCol);
        graphNodeRow = new Int16Array(data.sabGraphNodeRow);
        graphEdgeOffsets = new Int32Array(data.sabGraphEdgeOffsets);
        graphEdgeTargets = new Int16Array(data.sabGraphEdgeTargets);
        graphEdgeCosts = new Uint16Array(data.sabGraphEdgeCosts);
        maxPathLen = data.maxPathLen;
        maxAbstractLen = data.maxAbstractLen;
        return;
    }
    if (type === "syncNav") {
        bindNavBuffers(e.data);
        self.postMessage({ type: "syncNavDone" });
        return;
    }
    if (type === "localAStar") {
        const path = runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navView, cols, rows, maxLen, aStarGScore, aStarCameFrom, aStarVisited, runId);
        writeCellPath(path);
        pathMeta[1] = 0;
        self.postMessage({ type: "hpaDone", slot, requestId });
        return;
    }
    if (type === "abstractAStar") {
        const pathIdx = runAbstractAStarFlat(
            startIdx,
            targetIdx,
            graphNodeCol.subarray(0, nodeCount),
            graphNodeRow.subarray(0, nodeCount),
            graphEdgeOffsets.subarray(0, nodeCount + 1),
            graphEdgeTargets.subarray(0, edgeWrite),
            graphEdgeCosts.subarray(0, edgeWrite),
            nodeCount,
        );
        writeAbstractPath(pathIdx);
        pathMeta[0] = 0;
        self.postMessage({ type: "hpaDone", slot, requestId });
    }
};
