import { MinHeap, IdxMinHeap } from "../DataStructures/MinHeap.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS, octileDistance } from "../Spatial/grid/GridUtils.js";
const STALE_F_EPSILON = 1e-4;
/** @param {number} c0 @param {number} r0 @param {number} c1 @param {number} r1 */
function manhattanDistance(c0, r0, c1, r1) {
    return Math.abs(c0 - c1) + Math.abs(r0 - r1);
}
export class GridPathQuery {
    constructor(start, target) {
        this.start = start;
        this.target = target;
    }
    static fromCells(startCol, startRow, targetCol, targetRow) {
        return new GridPathQuery({ col: startCol, row: startRow }, { col: targetCol, row: targetRow });
    }
}
export class FlatGridSearch {
    constructor({ navGraph, cols, rows, searchState, stepPenaltyLookup = null }) {
        this.navGraph = navGraph;
        this.cols = cols;
        this.rows = rows;
        this.searchState = searchState;
        this.stepPenaltyLookup = stepPenaltyLookup;
    }
    cardinal(query, maxPathLen) {
        return runCardinalAStarFlat(query.start.col, query.start.row, query.target.col, query.target.row, this.navGraph, this.cols, this.rows, maxPathLen, this.searchState.prepare());
    }
    local(query, maxPathLen) {
        return runLocalAStarFlat(
            query.start.col,
            query.start.row,
            query.target.col,
            query.target.row,
            this.navGraph,
            this.cols,
            this.rows,
            maxPathLen,
            this.searchState.prepare(),
            this.stepPenaltyLookup,
        );
    }
    dijkstra(query, maxPathLen) {
        return runDijkstraFlat(
            query.start.col,
            query.start.row,
            query.target.col,
            query.target.row,
            this.navGraph,
            this.cols,
            this.rows,
            maxPathLen,
            this.searchState.prepare(),
            this.stepPenaltyLookup,
        );
    }
    greedy(query, maxPathLen) {
        return runGreedyBestFirstFlat(
            query.start.col,
            query.start.row,
            query.target.col,
            query.target.row,
            this.navGraph,
            this.cols,
            this.rows,
            maxPathLen,
            this.searchState.prepare(),
            this.stepPenaltyLookup,
        );
    }
}
export class FlatAbstractGraphSearch {
    constructor({ nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, searchState }) {
        this.nodeCol = nodeCol;
        this.nodeRow = nodeRow;
        this.edgeOffsets = edgeOffsets;
        this.edgeTargets = edgeTargets;
        this.edgeCosts = edgeCosts;
        this.nodeCount = nodeCount;
        this.searchState = searchState;
    }
    run(startIdx, targetIdx) {
        return runAbstractAStarFlat(startIdx, targetIdx, this.nodeCol, this.nodeRow, this.edgeOffsets, this.edgeTargets, this.edgeCosts, this.nodeCount, this.searchState.prepare());
    }
}
/** 4-connected grid A* — for axis-aligned tubes (corridors); never cuts corners diagonally. */
export function runCardinalAStarFlat(startCol, startRow, targetCol, targetRow, navGraph, cols, rows, maxPathLen, searchState) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) return [{ col: startCol, row: startRow }];
    const openSet = new IdxMinHeap();
    const { gScore, cameFrom, visited, runId } = searchState;
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;
    openSet.push(startIdx, manhattanDistance(startCol, startRow, targetCol, targetRow));
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;
        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];
        if (curr.f > currentG + manhattanDistance(currCol, currRow, targetCol, targetRow) + STALE_F_EPSILON) continue;
        if (currentG > maxPathLen) continue;
        if (currIdx === targetIdx) {
            const path = [];
            let currNode = currIdx;
            while (currNode !== -1) {
                path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
                currNode = cameFrom[currNode];
            }
            path.reverse();
            return path;
        }
        for (const offset of CARDINAL_OFFSETS) {
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                if (!navGraph.canStep(currCol, currRow, nc, nr)) continue;
                const nIdx = nr * cols + nc;
                const tentativeG = currentG + 1;
                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    openSet.push(nIdx, tentativeG + manhattanDistance(nc, nr, targetCol, targetRow));
                }
            }
        }
    }
    return null;
}
export function runLocalAStarFlat(startCol, startRow, targetCol, targetRow, navGraph, cols, rows, maxPathLen, searchState, stepPenaltyLookup = null) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) return [{ col: startCol, row: startRow }];
    const openSet = new IdxMinHeap();
    const { gScore, cameFrom, visited, runId } = searchState;
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;
    openSet.push(startIdx, octileDistance(startCol, startRow, targetCol, targetRow));
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;
        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];
        if (curr.f > currentG + octileDistance(currCol, currRow, targetCol, targetRow) + STALE_F_EPSILON) continue;
        if (currentG > maxPathLen) continue;
        if (currIdx === targetIdx) {
            const path = [];
            let currNode = currIdx;
            while (currNode !== -1) {
                path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
                currNode = cameFrom[currNode];
            }
            path.reverse();
            return path;
        }
        for (const offset of OCTILE_OFFSETS) {
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                if (!navGraph.canStep(currCol, currRow, nc, nr)) continue;
                const nIdx = nr * cols + nc;
                const stepExtra = stepPenaltyLookup ? stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
                const tentativeG = currentG + offset.cost + stepExtra;
                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    openSet.push(nIdx, tentativeG + octileDistance(nc, nr, targetCol, targetRow));
                }
            }
        }
    }
    return null;
}
export function runAbstractAStar(startNodeId, targetNodeId, nodesMap) {
    const startNode = nodesMap[startNodeId];
    const targetNode = nodesMap[targetNodeId];
    if (!startNode || !targetNode) return null;
    const openSet = new MinHeap((a, b) => a.f - b.f);
    const cameFrom = {};
    const gScore = {};
    gScore[startNodeId] = 0;
    openSet.push({ id: startNodeId, f: octileDistance(startNode.col, startNode.row, targetNode.col, targetNode.row) });
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currentId = curr.id;
        const currentNode = nodesMap[currentId];
        const currentG = gScore[currentId];
        const bestF = currentG + octileDistance(currentNode.col, currentNode.row, targetNode.col, targetNode.row);
        if (curr.f > bestF + STALE_F_EPSILON) continue;
        if (currentId === targetNodeId) {
            const path = [];
            let currNodeId = currentId;
            while (currNodeId !== undefined) {
                path.push(nodesMap[currNodeId]);
                currNodeId = cameFrom[currNodeId];
            }
            path.reverse();
            return path;
        }
        for (const edge of currentNode.edges) {
            const neighborId = edge.targetId;
            const neighborNode = nodesMap[neighborId];
            if (!neighborNode) continue;
            const tentativeG = currentG + edge.cost;
            if (gScore[neighborId] === undefined || tentativeG < gScore[neighborId]) {
                cameFrom[neighborId] = currentId;
                gScore[neighborId] = tentativeG;
                openSet.push({ id: neighborId, f: tentativeG + octileDistance(neighborNode.col, neighborNode.row, targetNode.col, targetNode.row) });
            }
        }
    }
    return null;
}
/** Flat CSR abstract A* — node indices, worker-safe. */
export function runAbstractAStarFlat(startIdx, targetIdx, nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, searchState) {
    if (startIdx === targetIdx) return [startIdx];
    const targetCol = nodeCol[targetIdx];
    const targetRow = nodeRow[targetIdx];
    const openSet = new MinHeap((a, b) => a.f - b.f);
    const { gScore, cameFrom, visited, runId } = searchState;
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;
    openSet.push({ id: startIdx, f: octileDistance(nodeCol[startIdx], nodeRow[startIdx], targetCol, targetRow) });
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currentIdx = curr.id;
        const currentG = gScore[currentIdx];
        const bestF = currentG + octileDistance(nodeCol[currentIdx], nodeRow[currentIdx], targetCol, targetRow);
        if (curr.f > bestF + STALE_F_EPSILON) continue;
        if (currentIdx === targetIdx) {
            const path = [];
            let node = currentIdx;
            while (node !== -1) {
                path.push(node);
                node = cameFrom[node];
            }
            path.reverse();
            return path;
        }
        const edgeStart = edgeOffsets[currentIdx];
        const edgeEnd = edgeOffsets[currentIdx + 1];
        for (let i = edgeStart; i < edgeEnd; i++) {
            const neighborIdx = edgeTargets[i];
            const tentativeG = currentG + edgeCosts[i];
            if (visited[neighborIdx] !== runId || tentativeG < gScore[neighborIdx]) {
                visited[neighborIdx] = runId;
                cameFrom[neighborIdx] = currentIdx;
                gScore[neighborIdx] = tentativeG;
                openSet.push({ id: neighborIdx, f: tentativeG + octileDistance(nodeCol[neighborIdx], nodeRow[neighborIdx], targetCol, targetRow) });
            }
        }
    }
    return null;
}
export function runDijkstraFlat(startCol, startRow, targetCol, targetRow, navGraph, cols, rows, maxPathLen, searchState, stepPenaltyLookup = null) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) return [{ col: startCol, row: startRow }];
    const openSet = new IdxMinHeap();
    const { gScore, cameFrom, visited, runId } = searchState;
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;
    openSet.push(startIdx, 0);
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;
        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];
        if (curr.f > currentG + STALE_F_EPSILON) continue;
        if (currentG > maxPathLen) continue;
        if (currIdx === targetIdx) {
            const path = [];
            let currNode = currIdx;
            while (currNode !== -1) {
                path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
                currNode = cameFrom[currNode];
            }
            path.reverse();
            return path;
        }
        for (const offset of OCTILE_OFFSETS) {
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                if (!navGraph.canStep(currCol, currRow, nc, nr)) continue;
                const nIdx = nr * cols + nc;
                const stepExtra = stepPenaltyLookup ? stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
                const tentativeG = currentG + offset.cost + stepExtra;
                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    openSet.push(nIdx, tentativeG);
                }
            }
        }
    }
    return null;
}
export function runGreedyBestFirstFlat(startCol, startRow, targetCol, targetRow, navGraph, cols, rows, maxPathLen, searchState, stepPenaltyLookup = null) {
    const startIdx = startRow * cols + startCol;
    const targetIdx = targetRow * cols + targetCol;
    if (startIdx === targetIdx) return [{ col: startCol, row: startRow }];
    const openSet = new IdxMinHeap();
    const { gScore, cameFrom, visited, runId } = searchState;
    gScore[startIdx] = 0;
    visited[startIdx] = runId;
    cameFrom[startIdx] = -1;
    openSet.push(startIdx, octileDistance(startCol, startRow, targetCol, targetRow));
    while (openSet.size > 0) {
        const curr = openSet.pop();
        const currIdx = curr.idx;
        const currCol = currIdx % cols;
        const currRow = (currIdx / cols) | 0;
        const currentG = gScore[currIdx];
        if (currentG > maxPathLen) continue;
        if (currIdx === targetIdx) {
            const path = [];
            let currNode = currIdx;
            while (currNode !== -1) {
                path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
                currNode = cameFrom[currNode];
            }
            path.reverse();
            return path;
        }
        for (const offset of OCTILE_OFFSETS) {
            const nc = currCol + offset.dc;
            const nr = currRow + offset.dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                if (!navGraph.canStep(currCol, currRow, nc, nr)) continue;
                const nIdx = nr * cols + nc;
                const stepExtra = stepPenaltyLookup ? stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
                const tentativeG = currentG + offset.cost + stepExtra;
                if (visited[nIdx] !== runId || tentativeG < gScore[nIdx]) {
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    openSet.push(nIdx, octileDistance(nc, nr, targetCol, targetRow));
                }
            }
        }
    }
    return null;
}
