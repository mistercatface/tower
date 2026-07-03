import { IdxMinHeap } from "../DataStructures/MinHeap.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS, manhattanDistanceIdx, octileDistanceIdx } from "../Spatial/grid/GridUtils.js";
const STALE_F_EPSILON = 1e-4;
function preparedSearchState(searchState) {
    return typeof searchState.prepare === "function" ? searchState.prepare() : searchState;
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
export class FlatGridSearch {
    constructor(searchState, stepPenaltyLookup = null) {
        this.searchState = searchState;
        this.stepPenaltyLookup = stepPenaltyLookup;
        this._grid = null;
        this.cols = 0;
        this.neighbors = null;
        this.cellCount = 0;
        this._cardinalDidx = null;
        this._octileDidx = null;
        this._lastCols = 0;
    }
    get grid() {
        return this._grid;
    }
    set grid(g) {
        this._grid = g;
        if (g) this.cols = g.cols;
    }
    getOffsets(policyOffsets, cols) {
        if (this._lastCols !== cols) {
            this._lastCols = cols;
            this._cardinalDidx = new Int32Array(4);
            for (let i = 0; i < 4; i++) this._cardinalDidx[i] = CARDINAL_OFFSETS[i].dc + CARDINAL_OFFSETS[i].dr * cols;
            this._octileDidx = new Int32Array(8);
            for (let i = 0; i < 8; i++) this._octileDidx[i] = OCTILE_OFFSETS[i].dc + OCTILE_OFFSETS[i].dr * cols;
        }
        return policyOffsets === CARDINAL_OFFSETS ? this._cardinalDidx : this._octileDidx;
    }
    manhattanDistance(idx0, idx1) {
        return manhattanDistanceIdx(idx0, idx1, this.cols);
    }
    octileDistance(idx0, idx1) {
        return octileDistanceIdx(idx0, idx1, this.cols);
    }
    cardinal(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 4, (i0, i1) => this.manhattanDistance(i0, i1), "astar", "astar", false, outPath);
    }
    local(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, (i0, i1) => this.octileDistance(i0, i1), "astar", "astar", true, outPath);
    }
    dijkstra(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, (i0, i1) => this.octileDistance(i0, i1), "dijkstra", "dijkstra", true, outPath);
    }
    greedy(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, (i0, i1) => this.octileDistance(i0, i1), "greedy", null, true, outPath);
    }
    runGrid(startIdx, targetIdx, maxPathLen, maxDirs, heuristic, priority, stale, stepPenalty, outPath) {
        if (startIdx === targetIdx) {
            outPath[0] = startIdx;
            return 1;
        }
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        const heuristicFn = heuristic;
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, this.priorityFor(priority, 0, startIdx, targetIdx, heuristicFn));
        const neighbors = this.neighbors;
        if (neighbors) {
            const edgeCosts = maxDirs === 4 ? CARDINAL_COSTS : OCTILE_COSTS;
            while (globalOpenSet.size > 0) {
                const currIdx = globalOpenSet.pop();
                const currentG = gScore[currIdx];
                if (this.isStaleQueueEntry(globalOpenSet.lastPopPriority, currentG, currIdx, targetIdx, heuristicFn, stale)) continue;
                if (currentG > maxPathLen) continue;
                if (currIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
                const base = currIdx * 8;
                for (let i = 0; i < maxDirs; i++) {
                    const nIdx = neighbors[base + i];
                    if (nIdx === -1) continue;
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCost(nIdx) : 0;
                    const tentativeG = currentG + edgeCosts[i] + stepExtra;
                    if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    globalOpenSet.push(nIdx, this.priorityFor(priority, tentativeG, nIdx, targetIdx, heuristicFn));
                }
            }
        } else {
            const grid = this.grid;
            const cols = grid.cols;
            const offsets = this.getOffsets(maxDirs === 4 ? CARDINAL_OFFSETS : OCTILE_OFFSETS, cols);
            const edgeCosts = maxDirs === 4 ? CARDINAL_COSTS : OCTILE_COSTS;
            while (globalOpenSet.size > 0) {
                const currIdx = globalOpenSet.pop();
                const currentG = gScore[currIdx];
                if (this.isStaleQueueEntry(globalOpenSet.lastPopPriority, currentG, currIdx, targetIdx, heuristicFn, stale)) continue;
                if (currentG > maxPathLen) continue;
                if (currIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currIdx, outPath);
                for (let i = 0; i < maxDirs; i++) {
                    const nIdx = currIdx + offsets[i];
                    if (!grid.canStep(currIdx, nIdx)) continue;
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCost(nIdx) : 0;
                    const tentativeG = currentG + edgeCosts[i] + stepExtra;
                    if (visited[nIdx] === runId && tentativeG >= gScore[nIdx]) continue;
                    visited[nIdx] = runId;
                    gScore[nIdx] = tentativeG;
                    cameFrom[nIdx] = currIdx;
                    globalOpenSet.push(nIdx, this.priorityFor(priority, tentativeG, nIdx, targetIdx, heuristicFn));
                }
            }
        }
        return 0;
    }
    priorityFor(priority, tentativeG, idx, targetIdx, heuristic) {
        if (priority === "dijkstra") return tentativeG;
        const h = heuristic(idx, targetIdx);
        if (priority === "greedy") return h;
        return tentativeG + h;
    }
    isStaleQueueEntry(currF, currentG, idx, targetIdx, heuristic, stale) {
        if (stale === "dijkstra") return currF > currentG + STALE_F_EPSILON;
        if (stale === "astar") return currF > currentG + heuristic(idx, targetIdx) + STALE_F_EPSILON;
        return false;
    }
}
const CARDINAL_COSTS = new Float32Array([1, 1, 1, 1]);
const OCTILE_COSTS = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2]);
export class FlatGraphView {
    constructor({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite = edgeTargets?.length ?? 0, nodeIds = null }) {
        this.nodeIdx = nodeIdx;
        this.cols = cols;
        this.edgeOffsets = edgeOffsets;
        this.edgeTargets = edgeTargets;
        this.edgeCosts = edgeCosts;
        this.nodeCount = nodeCount;
        this.edgeWrite = edgeWrite;
        this.nodeIds = nodeIds;
    }
}
export class FlatAbstractGraphSearch {
    constructor({ graph = null, nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds, searchState }) {
        this.graph = graph ?? new FlatGraphView({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds });
        this.searchState = searchState;
    }
    run(startIdx, targetIdx, outPath) {
        const graph = this.graph;
        if (startIdx === targetIdx) {
            outPath[0] = startIdx;
            return 1;
        }
        const targetNodeIdx = graph.nodeIdx[targetIdx];
        globalOpenSet.reset();
        const { gScore, cameFrom, visited, runId } = preparedSearchState(this.searchState);
        gScore[startIdx] = 0;
        visited[startIdx] = runId;
        cameFrom[startIdx] = -1;
        globalOpenSet.push(startIdx, octileDistanceIdx(graph.nodeIdx[startIdx], targetNodeIdx, graph.cols));
        while (globalOpenSet.size > 0) {
            const currentIdx = globalOpenSet.pop();
            const currentG = gScore[currentIdx];
            const bestF = currentG + octileDistanceIdx(graph.nodeIdx[currentIdx], targetNodeIdx, graph.cols);
            if (globalOpenSet.lastPopPriority > bestF + STALE_F_EPSILON) continue;
            if (currentIdx === targetIdx) return reconstructIndexPathInto(cameFrom, currentIdx, outPath);
            const edgeStart = graph.edgeOffsets[currentIdx];
            const edgeEnd = graph.edgeOffsets[currentIdx + 1];
            for (let i = edgeStart; i < edgeEnd; i++) {
                const neighborIdx = graph.edgeTargets[i];
                const tentativeG = currentG + graph.edgeCosts[i];
                if (visited[neighborIdx] === runId && tentativeG >= gScore[neighborIdx]) continue;
                visited[neighborIdx] = runId;
                cameFrom[neighborIdx] = currentIdx;
                gScore[neighborIdx] = tentativeG;
                globalOpenSet.push(neighborIdx, tentativeG + octileDistanceIdx(graph.nodeIdx[neighborIdx], targetNodeIdx, graph.cols));
            }
        }
        return 0;
    }
}
