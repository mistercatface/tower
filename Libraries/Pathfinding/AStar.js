import { IdxMinHeap } from "../DataStructures/MinHeap.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS, octileDistance } from "../Spatial/grid/GridUtils.js";
import { FlatGridView } from "./FlatGridView.js";
const STALE_F_EPSILON = 1e-4;
function manhattanDistance(c0, r0, c1, r1) {
    return Math.abs(c0 - c1) + Math.abs(r0 - r1);
}
function preparedSearchState(searchState) {
    return typeof searchState.prepare === "function" ? searchState.prepare() : searchState;
}
function reconstructGridPath(cameFrom, targetIdx, cols) {
    const path = [];
    let currNode = targetIdx;
    while (currNode !== -1) {
        path.push({ col: currNode % cols, row: (currNode / cols) | 0 });
        currNode = cameFrom[currNode];
    }
    path.reverse();
    return path;
}
function reconstructIndexPath(cameFrom, targetIdx) {
    const path = [];
    let node = targetIdx;
    while (node !== -1) {
        path.push(node);
        node = cameFrom[node];
    }
    path.reverse();
    return path;
}
function reconstructIndexPathInto(cameFrom, targetIdx, outPath) {
    let count = 0;
    let node = targetIdx;
    while (node !== -1) {
        outPath[count++] = node;
        node = cameFrom[node];
    }
    for (let i = 0; i < count >> 1; i++) {
        const tmp = outPath[i];
        outPath[i] = outPath[count - 1 - i];
        outPath[count - 1 - i] = tmp;
    }
    return count;
}
const globalOpenSet = new IdxMinHeap();
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
    constructor({ grid, navGraph, cols, rows, searchState, stepPenaltyLookup = null }) {
        this.grid = grid || new FlatGridView(cols, rows, { blocked: navGraph?.grid || null, canStep: (c0, r0, c1, r1) => (navGraph ? navGraph.canStep(c0, r0, c1, r1) : true) });
        this.searchState = searchState;
        this.stepPenaltyLookup = stepPenaltyLookup;
    }
    cardinal(query, maxPathLen, outPath) {
        return this.runGrid(query, maxPathLen, { offsets: CARDINAL_OFFSETS, heuristic: manhattanDistance, priority: "astar", stale: "astar", stepPenalty: false }, outPath);
    }
    local(query, maxPathLen, outPath) {
        return this.runGrid(query, maxPathLen, { offsets: OCTILE_OFFSETS, heuristic: octileDistance, priority: "astar", stale: "astar", stepPenalty: true }, outPath);
    }
    dijkstra(query, maxPathLen, outPath) {
        return this.runGrid(query, maxPathLen, { offsets: OCTILE_OFFSETS, heuristic: octileDistance, priority: "dijkstra", stale: "dijkstra", stepPenalty: true }, outPath);
    }
    greedy(query, maxPathLen, outPath) {
        return this.runGrid(query, maxPathLen, { offsets: OCTILE_OFFSETS, heuristic: octileDistance, priority: "greedy", stale: null, stepPenalty: true }, outPath);
    }
    runGrid(query, maxPathLen, policy, outPath) {
        const { start, target } = query;
        const grid = this.grid;
        const cols = grid.cols;
        const rows = grid.rows;
        const startIdx = grid.idx(start.col, start.row);
        const targetIdx = grid.idx(target.col, target.row);
        if (startIdx === targetIdx) {
            if (outPath) {
                outPath[0] = startIdx;
                return 1;
            }
            return [{ col: start.col, row: start.row }];
        }
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        const targetCol = target.col;
        const targetRow = target.row;
        const heuristic = policy.heuristic;
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, this.priorityFor(policy.priority, 0, start.col, start.row, targetCol, targetRow, heuristic));
        while (globalOpenSet.size > 0) {
            const currIdx = globalOpenSet.pop();
            const currCol = currIdx % cols;
            const currRow = (currIdx / cols) | 0;
            const currentG = gScore[currIdx];
            if (this.isStaleQueueEntry(globalOpenSet.lastPopPriority, currentG, currCol, currRow, targetCol, targetRow, heuristic, policy.stale)) continue;
            if (currentG > maxPathLen) continue;
            if (currIdx === targetIdx)
                if (outPath) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
                else return reconstructGridPath(cameFrom, currIdx, cols);
            for (const offset of policy.offsets) {
                const nc = currCol + offset.dc;
                const nr = currRow + offset.dr;
                if (!grid.contains(nc, nr)) continue;
                if (!grid.canStep(currCol, currRow, nc, nr)) continue;
                const nIdx = grid.idx(nc, nr);
                const stepExtra = policy.stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
                const tentativeG = currentG + (offset.cost ?? 1) + stepExtra;
                if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                visited[nIdx] = runId;
                gScore[nIdx] = tentativeG;
                cameFrom[nIdx] = currIdx;
                globalOpenSet.push(nIdx, this.priorityFor(policy.priority, tentativeG, nc, nr, targetCol, targetRow, heuristic));
            }
        }
        return outPath ? 0 : null;
    }
    priorityFor(priority, tentativeG, col, row, targetCol, targetRow, heuristic) {
        if (priority === "dijkstra") return tentativeG;
        const h = heuristic(col, row, targetCol, targetRow);
        if (priority === "greedy") return h;
        return tentativeG + h;
    }
    isStaleQueueEntry(currF, currentG, col, row, targetCol, targetRow, heuristic, stale) {
        if (stale === "dijkstra") return currF > currentG + STALE_F_EPSILON;
        if (stale === "astar") return currF > currentG + heuristic(col, row, targetCol, targetRow) + STALE_F_EPSILON;
        return false;
    }
}
export class FlatGraphView {
    constructor({ nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite = edgeTargets?.length ?? 0, nodeIds = null }) {
        this.nodeCol = nodeCol;
        this.nodeRow = nodeRow;
        this.edgeOffsets = edgeOffsets;
        this.edgeTargets = edgeTargets;
        this.edgeCosts = edgeCosts;
        this.nodeCount = nodeCount;
        this.edgeWrite = edgeWrite;
        this.nodeIds = nodeIds;
    }
}
export class FlatAbstractGraphSearch {
    constructor({ graph = null, nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds, searchState }) {
        this.graph = graph ?? new FlatGraphView({ nodeCol, nodeRow, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds });
        this.searchState = searchState;
    }
    run(startIdx, targetIdx, outPath) {
        const graph = this.graph;
        if (startIdx === targetIdx) {
            if (outPath) {
                outPath[0] = startIdx;
                return 1;
            }
            return [startIdx];
        }
        const targetCol = graph.nodeCol[targetIdx];
        const targetRow = graph.nodeRow[targetIdx];
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, octileDistance(graph.nodeCol[startIdx], graph.nodeRow[startIdx], targetCol, targetRow));
        while (globalOpenSet.size > 0) {
            const currentIdx = globalOpenSet.pop();
            const currentG = gScore[currentIdx];
            const bestF = currentG + octileDistance(graph.nodeCol[currentIdx], graph.nodeRow[currentIdx], targetCol, targetRow);
            if (globalOpenSet.lastPopPriority > bestF + STALE_F_EPSILON) continue;
            if (currentIdx === targetIdx)
                if (outPath) return reconstructIndexPathInto(cameFrom, currentIdx, outPath);
                else return reconstructIndexPath(cameFrom, currentIdx);
            const edgeStart = graph.edgeOffsets[currentIdx];
            const edgeEnd = graph.edgeOffsets[currentIdx + 1];
            for (let i = edgeStart; i < edgeEnd; i++) {
                const neighborIdx = graph.edgeTargets[i];
                const tentativeG = currentG + graph.edgeCosts[i];
                if (visited[neighborIdx] === runId && tentativeG >= gScore[neighborIdx]) continue;
                visited[neighborIdx] = runId;
                cameFrom[neighborIdx] = currentIdx;
                gScore[neighborIdx] = tentativeG;
                globalOpenSet.push(neighborIdx, tentativeG + octileDistance(graph.nodeCol[neighborIdx], graph.nodeRow[neighborIdx], targetCol, targetRow));
            }
        }
        return outPath ? 0 : null;
    }
}
