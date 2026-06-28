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
        this.grid = null;
        this.neighbors = null;
        this.gridIdx = null;
        this.cellCount = 0;
        this._lastSize = 0;
        this._cardinalOffsets = null;
        this._octileOffsets = null;
        this._lastCols = 0;
    }
    rebuildCoordinateTables(cols, rows) {
        const size = cols * rows;
        this.cellCount = size;
        if (this._lastSize !== size) {
            this._lastSize = size;
            this.gridIdx = new Int16Array(size * 2);
            for (let i = 0; i < size; i++) {
                const base = i * 2;
                this.gridIdx[base] = i % cols;
                this.gridIdx[base + 1] = (i / cols) | 0;
            }
        }
    }
    getOffsets(policyOffsets, cols) {
        if (this._lastCols !== cols) {
            this._lastCols = cols;
            this._cardinalOffsets = CARDINAL_OFFSETS.map((o) => ({ cost: o.cost, didx: o.dc + o.dr * cols }));
            this._octileOffsets = OCTILE_OFFSETS.map((o) => ({ cost: o.cost, didx: o.dc + o.dr * cols }));
        }
        return policyOffsets === CARDINAL_OFFSETS ? this._cardinalOffsets : this._octileOffsets;
    }
    manhattanDistance(idx0, idx1) {
        const base0 = idx0 * 2;
        const base1 = idx1 * 2;
        const dx = Math.abs(this.gridIdx[base0] - this.gridIdx[base1]);
        const dy = Math.abs(this.gridIdx[base0 + 1] - this.gridIdx[base1 + 1]);
        return dx + dy;
    }
    octileDistance(idx0, idx1) {
        const base0 = idx0 * 2;
        const base1 = idx1 * 2;
        const dx = Math.abs(this.gridIdx[base0] - this.gridIdx[base1]);
        const dy = Math.abs(this.gridIdx[base0 + 1] - this.gridIdx[base1 + 1]);
        const min = Math.min(dx, dy);
        const max = Math.max(dx, dy);
        return min * 1.41421356 + (max - min);
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
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
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
                    const nIdx = currIdx + offsets[i].didx;
                    if (!grid.canStep(currIdx, nIdx)) continue;
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCostForIdx(nIdx) : 0;
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
            outPath[0] = startIdx;
            return 1;
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
                globalOpenSet.push(neighborIdx, tentativeG + octileDistance(graph.nodeCol[neighborIdx], graph.nodeRow[neighborIdx], targetCol, targetRow));
            }
        }
        return 0;
    }
}
