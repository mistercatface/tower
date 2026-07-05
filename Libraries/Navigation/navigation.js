import { IdxMinHeap } from "./../DataStructures/MinHeap.js";
import { CARDINAL_OFFSETS, OCTILE_OFFSETS } from "./../Math/math.js";
import {
    manhattanDistanceIdx,
    octileDistanceIdx,
    makeAdjacencyKey,
    forEachCardinalNeighbor,
    forEachCardinalNeighborIdx,
    boundaryBlocksStepFrom,
    recomputeNavCardinalOpenInto,
    recomputeVertexPassabilityInto,
    isNavTopologyReady,
    CELL_EDGE_SLOT_BYTES,
    cellEdgeSlotOffset,
    cellInRect,
    diagonalStepOpen,
    getCardinalBit,
    edgeNeighborIdx,
    FloorBelt,
    hasLineOfSight,
    worldColAtOrigin,
    worldRowAtOrigin,
} from "./../Spatial/spatial.js";
import { FloatingText } from "./../Render/FloatingText.js";
import { cellBoundsForGrid, forEachDenseCellInBounds, padCellIdxToGrid, padCellBoundsToGrid, clampCellBoundsToGrid, forEachDenseCellInRect } from "../Spatial/spatial.js";
import { MAX_HPA_REPLAN_SLOTS } from "./../Pathfinding/HpaPathWorker.js";
import { agentPose } from "./../Agent/index.js";
import { resolveBodyRadius } from "./../Physics/physics.js";
function _removeEdgeByTargetId(edges, targetId) {
    for (let i = edges.length - 1; i >= 0; i--) if (edges[i].targetId === targetId) edges.splice(i, 1);
}
function _removeCellByIdx(cells, idx) {
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i] === idx) cells.splice(i, 1);
}
import { resolveNavRuntime } from "./NavRuntime.js";
// --- MERGED FROM AStar.js ---
const STALE_F_EPSILON = 1e-4;
export class SearchState {
    constructor(size) {
        this.gScore = new Float32Array(size);
        this.cameFrom = new Int32Array(size);
        this.visited = new Int32Array(size);
        this.runId = 0;
    }
    prepare() {
        this.runId++;
        return this;
    }
    resize(size) {
        if (this.gScore.length !== size) {
            this.gScore = new Float32Array(size);
            this.cameFrom = new Int32Array(size);
            this.visited = new Int32Array(size);
            this.runId = 0;
        }
    }
}
export class FlatGridView {
    constructor(cols, rows, { blocked = null, neighborLayout = null, flowToNavIdx = null, canStep = null } = {}) {
        this.cols = cols;
        this.rows = rows;
        this.cellCount = cols * rows;
        this.blocked = blocked;
        this.neighborLayout = neighborLayout;
        this.flowToNavIdx = flowToNavIdx;
        this._canStep = canStep;
    }
    idx(col, row) {
        return row * this.cols + col;
    }
    contains(col, row) {
        return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
    }
    canStep(idx0, idx1) {
        if (idx0 < 0 || idx0 >= this.cellCount || idx1 < 0 || idx1 >= this.cellCount) return false;
        const cols = this.cols;
        if (Math.abs((idx0 % cols) - (idx1 % cols)) > 1) return false; // Boundary horizontal wrap check
        if (this._canStep) return this._canStep(idx0, idx1);
        if (this.blocked) return !this.blocked[idx1];
        return true;
    }
}
function preparedSearchState(searchState) {
    return searchState.prepare();
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
const SEARCH_MODE = { AStar: 1, Dijkstra: 2, Greedy: 3 };
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
        this.manhattanHeuristic = (i0, i1) => this.manhattanDistance(i0, i1);
        this.octileHeuristic = (i0, i1) => this.octileDistance(i0, i1);
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
        return this.runGrid(startIdx, targetIdx, maxPathLen, 4, this.manhattanHeuristic, SEARCH_MODE.AStar, SEARCH_MODE.AStar, false, outPath);
    }
    local(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, this.octileHeuristic, SEARCH_MODE.AStar, SEARCH_MODE.AStar, true, outPath);
    }
    dijkstra(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, this.octileHeuristic, SEARCH_MODE.Dijkstra, SEARCH_MODE.Dijkstra, true, outPath);
    }
    greedy(startIdx, targetIdx, maxPathLen, outPath) {
        return this.runGrid(startIdx, targetIdx, maxPathLen, 8, this.octileHeuristic, SEARCH_MODE.Greedy, 0, true, outPath);
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
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCost(nIdx, currIdx) : 0;
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
                    const stepExtra = stepPenalty && this.stepPenaltyLookup ? this.stepPenaltyLookup.extraCost(nIdx, currIdx) : 0;
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
        if (priority === SEARCH_MODE.Dijkstra) return tentativeG;
        const h = heuristic(idx, targetIdx);
        if (priority === SEARCH_MODE.Greedy) return h;
        return tentativeG + h;
    }
    isStaleQueueEntry(currF, currentG, idx, targetIdx, heuristic, stale) {
        if (stale === SEARCH_MODE.Dijkstra) return currF > currentG + STALE_F_EPSILON;
        if (stale === SEARCH_MODE.AStar) return currF > currentG + heuristic(idx, targetIdx) + STALE_F_EPSILON;
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
// --- MERGED FROM VoronoiRegions.js ---
export class RegionNode {
    constructor(id, idx) {
        this.id = id;
        this.idx = idx;
        this.edges = [];
        this.cells = [];
    }
}
export function computeDistanceTransform(grid, frame, distToWall = null) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const distances = distToWall ?? new Float32Array(size);
    distances.fill(Infinity);
    const queue = [];
    for (let i = 0; i < size; i++)
        if (grid[i]) {
            distances[i] = 0;
            const col = i % cols;
            const row = (i / cols) | 0;
            queue.push(col, row);
        }
    bfsColRowQueue(queue, (c, r, enqueue) => {
        const currIdx = r * cols + c;
        const currDist = distances[currIdx];
        for (const { dc, dr, cost } of OCTILE_OFFSETS) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                const nIdx = nr * cols + nc;
                const nextDist = currDist + cost;
                if (nextDist < distances[nIdx]) {
                    distances[nIdx] = nextDist;
                    enqueue(nc, nr);
                }
            }
        }
    });
    for (let i = 0; i < size; i++) if (distances[i] === Infinity) distances[i] = 1000;
    return distances;
}
export function floodFillRegion(startIdx, node, grid, frame, cellToNode, nodeCells, maxCellsPerChunk, navGraph, unassigned = null) {
    const { cols, rows } = frame;
    let cellCount = 0;
    cellToNode[startIdx] = node.idx;
    nodeCells.push(startIdx);
    cellCount++;
    bfsIndices([startIdx], (currIdx, enqueue) => {
        if (cellCount >= maxCellsPerChunk) return;
        forEachCardinalNeighborIdx(currIdx, cols, rows, (nIdx) => {
            if (navGraph && (!navGraph.canStepIdx(currIdx, nIdx) || !navGraph.canStepIdx(nIdx, currIdx))) return;
            if (grid[nIdx] === 0 && cellToNode[nIdx] === -1 && (!unassigned || unassigned.has(nIdx))) {
                if (unassigned) unassigned.delete(nIdx);
                cellToNode[nIdx] = node.idx;
                nodeCells.push(nIdx);
                enqueue(nIdx);
                cellCount++;
                if (cellCount >= maxCellsPerChunk) return;
            }
        });
    });
}
export function findRegionAdjacenciesInBox(cellToNode, frame, startCol, endCol, startRow, endRow, navGraph = null) {
    const { cols } = frame;
    const adjacencies = new Set();
    for (let r = startRow; r <= endRow; r++)
        for (let c = startCol; c <= endCol; c++) {
            const idx = r * cols + c;
            const nodeAIdx = cellToNode[idx];
            if (nodeAIdx === -1) continue;
            if (c + 1 <= endCol) {
                const nodeBIdx = cellToNode[idx + 1];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
            if (r + 1 <= endRow) {
                const nodeBIdx = cellToNode[idx + cols];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
        }
    return adjacencies;
}
export function mergeSmallRegions(nodesMap, cellToNode, frame, minCellsPerChunk, navGraph = null) {
    const { cols, rows } = frame;
    let merged;
    do {
        merged = false;
        for (const idStr of Object.keys(nodesMap)) {
            const id = Number(idStr);
            const node = nodesMap[id];
            if (!node) continue;
            const nodeCells = node.cells;
            if (!nodeCells || nodeCells.length === 0 || nodeCells.length >= minCellsPerChunk) continue;
            let neighborNode = null;
            for (let i = 0; i < nodeCells.length; i++) {
                const cellIdx = nodeCells[i];
                forEachCardinalNeighborIdx(cellIdx, cols, rows, (nIdx) => {
                    if (neighborNode) return;
                    const nNodeIdx = cellToNode[nIdx];
                    if (nNodeIdx !== -1 && nNodeIdx !== node.idx) {
                        const nNode = nodesMap[nNodeIdx];
                        if (nNode && (!navGraph || (navGraph.canStepIdx(cellIdx, nIdx) && navGraph.canStepIdx(nIdx, cellIdx)))) neighborNode = nNode;
                    }
                });
                if (neighborNode) break;
            }
            if (neighborNode) {
                const targetCells = neighborNode.cells;
                for (let i = 0; i < nodeCells.length; i++) {
                    const cellIdx = nodeCells[i];
                    cellToNode[cellIdx] = neighborNode.idx;
                    targetCells.push(cellIdx);
                }
                node.cells = [];
                delete nodesMap[id];
                merged = true;
            }
        }
    } while (merged);
}
export function repositionRegionCentroids(nodesMap, grid, frame, cellToNode) {
    const { cols } = frame;
    for (const idStr of Object.keys(nodesMap)) {
        const id = Number(idStr);
        const node = nodesMap[id];
        if (!node) continue;
        const nodeCells = node.cells;
        if (!nodeCells || nodeCells.length === 0) continue;
        let sumCol = 0;
        let sumRow = 0;
        const count = nodeCells.length;
        for (let i = 0; i < count; i++) {
            const cellIdx = nodeCells[i];
            sumCol += cellIdx % cols;
            sumRow += (cellIdx / cols) | 0;
        }
        const startIdx = node.idx;
        const centroidIdx = Math.floor(sumRow / count) * cols + Math.floor(sumCol / count);
        const finalIdx = grid[centroidIdx] || cellToNode[centroidIdx] !== node.idx ? startIdx : centroidIdx;
        if (finalIdx !== startIdx) {
            node.idx = finalIdx;
            const newId = finalIdx; // Pure integer ID
            node.id = newId;
            delete nodesMap[id];
            nodesMap[newId] = node;
            for (let i = 0; i < nodeCells.length; i++) cellToNode[nodeCells[i]] = finalIdx;
        }
    }
}
export function generateVoronoiRegions({ grid, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode = null, navGraph = null }) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const assignment = cellToNode ?? new Int32Array(size).fill(-1);
    assignment.fill(-1);
    const nodesMap = {};
    const emptyCells = [];
    for (let i = 0; i < size; i++) if (grid[i] === 0) emptyCells.push(i);
    emptyCells.sort((a, b) => distToWall[b] - distToWall[a]);
    for (const startIdx of emptyCells) {
        if (assignment[startIdx] !== -1) continue;
        const id = startIdx; // Pure integer ID
        const node = new RegionNode(id, startIdx);
        nodesMap[id] = node;
        floodFillRegion(startIdx, node, grid, frame, assignment, node.cells, maxCellsPerChunk, navGraph);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(nodesMap, assignment, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(nodesMap, grid, frame, assignment);
    return { nodesMap, cellToNode: assignment };
}
export function repositionNodeCentroid(node, cellToNode, grid, frame, nodesMap = null) {
    const { cols } = frame;
    const nodeCells = node.cells;
    const count = nodeCells.length;
    if (count === 0) return;
    let sumCol = 0;
    let sumRow = 0;
    for (let i = 0; i < count; i++) {
        const idx = nodeCells[i];
        sumCol += idx % cols;
        sumRow += (idx / cols) | 0;
    }
    const centroidIdx = Math.floor(sumRow / count) * cols + Math.floor(sumCol / count);
    const finalIdx = grid[centroidIdx] || cellToNode[centroidIdx] !== node.idx ? nodeCells[0] : centroidIdx;
    if (finalIdx !== node.idx) {
        const oldId = node.id;
        node.idx = finalIdx;
        const newId = finalIdx; // Pure integer ID
        node.id = newId;
        if (nodesMap) {
            delete nodesMap[oldId];
            nodesMap[newId] = node;
        }
        for (let i = 0; i < nodeCells.length; i++) cellToNode[nodeCells[i]] = finalIdx;
    }
}
export function findRegionAdjacencies(cellToNode, grid, frame, navGraph = null) {
    const { cols, rows } = frame;
    const adjacencies = new Set();
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const nodeAIdx = cellToNode[idx];
            if (nodeAIdx === -1) continue;
            if (c + 1 < cols) {
                const nodeBIdx = cellToNode[idx + 1];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + 1) || navGraph.canStepIdx(idx + 1, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
            if (r + 1 < rows) {
                const nodeBIdx = cellToNode[idx + cols];
                if (nodeBIdx !== -1 && nodeAIdx !== nodeBIdx && (!navGraph || navGraph.canStepIdx(idx, idx + cols) || navGraph.canStepIdx(idx + cols, idx)))
                    adjacencies.add(makeAdjacencyKey(nodeAIdx, nodeBIdx));
            }
        }
    return adjacencies;
}
// --- MERGED FROM hpaReplan.js ---
export const REPLAN_TARGET_MOVE_PX = 64;
export const REPLAN_OFF_PATH_COOLDOWN_MS = 250;
export const REPLAN_PRIORITY_TARGET = 4;
export const REPLAN_PRIORITY_VISIBLE = 3;
export const REPLAN_PRIORITY_NORMAL = 2;
export const REPLAN_PRIORITY_STUCK_OFFSCREEN = 1;
export const HPA_REPLAN_FRAME_START_BUDGET = 12;
export const HPA_REPLAN_PEAK_INFLIGHT_CAP = 16;
export function buildReplanParams(obstacleGrid, startX, startY, targetX, targetY, nav, stepPenalty, state = null) {
    return new HpaReplanRequest({
        obstacleGrid,
        startX,
        startY,
        targetX,
        targetY,
        graphEpoch: nav.graphSyncGeneration,
        topologyKey: nav.syncedTopologyKey(),
        navTopology: nav.topology,
        stepPenalty: stepPenalty ?? null,
        state,
    });
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function trackNavStuck(navState, x, y, stuckMoveThreshold) {
    const moved = Math.hypot(x - (navState.lastX ?? x), y - (navState.lastY ?? y));
    navState.lastX = x;
    navState.lastY = y;
    if (moved < stuckMoveThreshold) navState.stuckFrames += 1;
    else navState.stuckFrames = 0;
}
export function obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames) {
    return isVisible || stuckFrames > stuckReplanFrames;
}
/** @param {import("./navSession.js").NavSessionState} navState @param {string} currentTopologyKey */
export function obstacleEpochReplanDue(navState, currentTopologyKey) {
    return navState.topologyKey !== currentTopologyKey;
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function idlePathReplanReason(navState, settings, inFlight) {
    if (inFlight) return null;
    if (!navHasPath(navState)) return "noPath";
    if (navState.stuckFrames > settings.stuckReplanFrames) return "stuck";
    return null;
}
export function idlePathReplanAllowed(navState, reason, isVisible, stuckReplanFrames) {
    return reason !== null && (isVisible || navState.stuckFrames > stuckReplanFrames);
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function offPathReplanDue(steering, navState, nowMs, cooldownMs = REPLAN_OFF_PATH_COOLDOWN_MS) {
    return navHasPath(navState) && steering.offPath && nowMs - navState.lastOffPathReplan >= cooldownMs;
}
/** @param {import("./navSession.js").NavSessionState} navState */
export function sandboxReplanReason(navState, pendingTargetReplan, inFlight, targetX, targetY) {
    if (inFlight) return null;
    if (pendingTargetReplan) return "targetChange";
    if (!navState.pathLen) return "noPath";
    const targetMovedPx = navState.lastTargetX == null || navState.lastTargetY == null ? Infinity : Math.hypot(targetX - navState.lastTargetX, targetY - navState.lastTargetY);
    if (targetMovedPx >= REPLAN_TARGET_MOVE_PX) return "targetMoved";
    return null;
}
export function sandboxReplanAllowed(reason, isVisible, stuckFrames, stuckReplanFrames) {
    if (reason === "targetChange") return true;
    if (reason === "noPath") return isVisible || stuckFrames > stuckReplanFrames;
    if (reason === "targetMoved") return obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames);
    return false;
}
export function replanPriorityFor(reason, isVisible) {
    if (reason === "targetChange") return REPLAN_PRIORITY_TARGET;
    if (!isVisible) return REPLAN_PRIORITY_STUCK_OFFSCREEN;
    if (reason === "noPath" || reason === "stuck" || reason === "offPath") return REPLAN_PRIORITY_VISIBLE;
    return REPLAN_PRIORITY_NORMAL;
}
export class HpaAbstractGraph extends FlatGraphView {
    constructor(nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds) {
        super({ nodeIdx, cols, edgeOffsets, edgeTargets, edgeCosts, nodeCount, edgeWrite, nodeIds });
        this._candidateSeen = new Int32Array(nodeCount).fill(-1);
        this._candidateGen = -1;
        const extCount = nodeCount + 2;
        const maxEdges = nodeCount * 8 + 128;
        this._extNodeIdx = new Int32Array(extCount);
        this._targetConnectCost = new Int32Array(nodeCount);
        this._startEdgesTarget = new Int32Array(nodeCount);
        this._startEdgesCost = new Int32Array(nodeCount);
        this._extEdgeOffsets = new Int32Array(extCount + 1);
        this._extEdgeTargets = new Int16Array(maxEdges);
        this._extEdgeCosts = new Uint16Array(maxEdges);
    }
    collectTempConnectCandidates(centerIdx, isStart, maxCellsPerChunk, anchorRegionIdx) {
        const searchRadius = Math.ceil(Math.sqrt(maxCellsPerChunk)) * 2;
        const out = [];
        const seen = this._candidateSeen;
        const gen = ++this._candidateGen;
        const add = (idx) => {
            if (idx < 0 || idx >= this.nodeCount || seen[idx] === gen) return;
            seen[idx] = gen;
            out.push(idx);
        };
        if (anchorRegionIdx >= 0) {
            add(anchorRegionIdx);
            if (isStart) {
                const edgeStart = this.edgeOffsets[anchorRegionIdx];
                const edgeEnd = this.edgeOffsets[anchorRegionIdx + 1];
                for (let e = edgeStart; e < edgeEnd; e++) add(this.edgeTargets[e]);
            } else
                for (let i = 0; i < this.nodeCount; i++) {
                    const edgeStart = this.edgeOffsets[i];
                    const edgeEnd = this.edgeOffsets[i + 1];
                    for (let e = edgeStart; e < edgeEnd; e++)
                        if (this.edgeTargets[e] === anchorRegionIdx) {
                            add(i);
                            break;
                        }
                }
            return out;
        }
        for (let i = 0; i < this.nodeCount; i++) {
            const idx = this.nodeIdx[i];
            if (octileDistanceIdx(centerIdx, idx, this.cols) <= searchRadius) add(i);
        }
        return out;
    }
    buildExtended(startIdx, targetIdx, cols, prep, maxCellsPerChunk, resolveLegCost) {
        const startCandidates = this.collectTempConnectCandidates(startIdx, true, maxCellsPerChunk, prep.startRegion);
        const targetCandidates = this.collectTempConnectCandidates(targetIdx, false, maxCellsPerChunk, prep.targetRegion);
        const startTemp = this.nodeCount;
        const targetTemp = this.nodeCount + 1;
        const extCount = this.nodeCount + 2;
        const extNodeIdx = this._extNodeIdx;
        extNodeIdx.set(this.nodeIdx);
        extNodeIdx[startTemp] = startIdx;
        extNodeIdx[targetTemp] = targetIdx;
        const targetConnectCost = this._targetConnectCost;
        targetConnectCost.fill(0, 0, this.nodeCount);
        let currentOffset = 0;
        for (let i = 0; i < targetCandidates.length; i++) {
            const cIdx = targetCandidates[i];
            const legKey = (cIdx << 16) | targetTemp;
            const cNodeIdx = extNodeIdx[cIdx];
            const cost = resolveLegCost(cNodeIdx, targetIdx, legKey, currentOffset);
            if (cost > 0) {
                targetConnectCost[cIdx] = cost;
                currentOffset += cost;
            }
        }
        const startEdgesTarget = this._startEdgesTarget;
        const startEdgesCost = this._startEdgesCost;
        let startEdgesCount = 0;
        for (let i = 0; i < startCandidates.length; i++) {
            const cIdx = startCandidates[i];
            const legKey = (startTemp << 16) | cIdx;
            const cNodeIdx = extNodeIdx[cIdx];
            const cost = resolveLegCost(startIdx, cNodeIdx, legKey, currentOffset);
            if (cost > 0) {
                startEdgesTarget[startEdgesCount] = cIdx;
                startEdgesCost[startEdgesCount] = cost;
                startEdgesCount++;
                currentOffset += cost;
            }
        }
        const extEdgeOffsets = this._extEdgeOffsets;
        extEdgeOffsets[0] = 0;
        for (let i = 0; i < this.nodeCount; i++) {
            const baseCount = this.edgeOffsets[i + 1] - this.edgeOffsets[i];
            const extraCount = targetConnectCost[i] > 0 ? 1 : 0;
            extEdgeOffsets[i + 1] = extEdgeOffsets[i] + baseCount + extraCount;
        }
        extEdgeOffsets[startTemp + 1] = extEdgeOffsets[startTemp] + startEdgesCount;
        extEdgeOffsets[targetTemp + 1] = extEdgeOffsets[targetTemp];
        const totalEdges = extEdgeOffsets[extCount];
        const extEdgeTargets = this._extEdgeTargets;
        const extEdgeCosts = this._extEdgeCosts;
        for (let i = 0; i < this.nodeCount; i++) {
            let write = extEdgeOffsets[i];
            const baseStart = this.edgeOffsets[i];
            const baseEnd = this.edgeOffsets[i + 1];
            for (let e = baseStart; e < baseEnd; e++) {
                extEdgeTargets[write] = this.edgeTargets[e];
                extEdgeCosts[write] = this.edgeCosts[e];
                write++;
            }
            if (targetConnectCost[i] > 0) {
                extEdgeTargets[write] = targetTemp;
                extEdgeCosts[write] = targetConnectCost[i];
                write++;
            }
        }
        let startWrite = extEdgeOffsets[startTemp];
        for (let i = 0; i < startEdgesCount; i++) {
            extEdgeTargets[startWrite] = startEdgesTarget[i];
            extEdgeCosts[startWrite] = startEdgesCost[i];
            startWrite++;
        }
        const extendedGraph = new FlatGraphView({
            nodeIdx: extNodeIdx,
            cols,
            edgeOffsets: extEdgeOffsets,
            edgeTargets: extEdgeTargets,
            edgeCosts: extEdgeCosts,
            nodeCount: extCount,
            edgeWrite: totalEdges,
            nodeIds: this.nodeIds,
        });
        return { extendedGraph, startTemp, targetTemp };
    }
}
export const HPA_LOCAL_MAX_LEN = 96;
export const HPA_REGION_CONNECT_MAX_LEN = 96;
export const HPA_LOCAL_DISTANCE_THRESHOLD = 32;
const globalReplanPayload = { startIdx: 0, targetIdx: 0, stepPenaltyKeys: null, stepPenaltyCosts: null };
export class HpaReplanRequest {
    constructor({ obstacleGrid, startX, startY, targetX, targetY, graphEpoch, topologyKey, navTopology, stepPenalty = null, state = null }) {
        this.obstacleGrid = obstacleGrid;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.graphEpoch = graphEpoch;
        this.topologyKey = topologyKey;
        this.navTopology = navTopology;
        this.stepPenalty = stepPenalty;
        this.state = state;
    }
    toWorkerPayload() {
        const grid = this.obstacleGrid;
        const cols = grid.cols;
        const rows = grid.rows;
        let startCol = Math.max(0, Math.min(cols - 1, grid.worldCol(this.startX)));
        let startRow = Math.max(0, Math.min(rows - 1, grid.worldRow(this.startY)));
        let targetCol = Math.max(0, Math.min(cols - 1, grid.worldCol(this.targetX)));
        let targetRow = Math.max(0, Math.min(rows - 1, grid.worldRow(this.targetY)));
        let startIdx = startCol + startRow * cols;
        startIdx = findNearestOpenCellIdx(grid.grid, cols, rows, startIdx);
        let targetIdx = targetCol + targetRow * cols;
        targetIdx = findNearestOpenCellIdx(grid.grid, cols, rows, targetIdx);
        const snappedIdx = snapNavGoalCellIndex(grid, startIdx, targetIdx);
        globalReplanPayload.startIdx = startIdx;
        globalReplanPayload.targetIdx = snappedIdx;
        globalReplanPayload.stepPenaltyKeys = this.stepPenalty?.keys ?? null;
        globalReplanPayload.stepPenaltyCosts = this.stepPenalty?.costs ?? null;
        return globalReplanPayload;
    }
    applyResult(navState, worker, result) {
        navState.topologyKey = this.topologyKey;
        if (!result || !result.pathLen) {
            worker.releaseOwnedPathSlot(navState);
            if (this.state && (navState.pendingReplanReason === "targetChange" || navState.pendingReplanReason === "targetMoved")) {
                const grid = this.obstacleGrid;
                const cols = grid.cols;
                const rows = grid.rows;
                const startCol = grid.worldCol(this.startX);
                const startRow = grid.worldRow(this.startY);
                const targetCol = grid.worldCol(this.targetX);
                const targetRow = grid.worldRow(this.targetY);
                let errorMsg = "Unreachable";
                if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) errorMsg = "Start out of bounds";
                else if (targetCol < 0 || targetCol >= cols || targetRow < 0 || targetRow >= rows) errorMsg = "Target out of bounds";
                else {
                    const startIdx = startCol + startRow * cols;
                    const targetIdx = targetCol + targetRow * cols;
                    if (grid.isBlockedIdx(startIdx)) errorMsg = "Start blocked";
                    else if (grid.isBlockedIdx(targetIdx)) errorMsg = "Target blocked";
                }
                FloatingText.spawn(this.state, this.targetX, this.targetY, errorMsg, "#ff3333");
            }
            return;
        }
        worker.releaseOwnedPathSlot(navState);
        navState.pathSlot = result.pathSlot;
        navState.pathLen = result.pathLen;
        navState.pathProgressIdx = findSabPathProgressIdx(this.startX, this.startY, worker, result.pathSlot, result.pathLen, this.obstacleGrid, this.navTopology);
        navState.routeId += 1;
        navState.lastAcceptedRouteReason = navState.pendingReplanReason;
        navState.lastAcceptedPathLen = result.pathLen;
        navState.lastAcceptedProgressIdx = navState.pathProgressIdx;
        navState.lastAcceptedTargetX = this.targetX;
        navState.lastAcceptedTargetY = this.targetY;
        navState.pendingReplanReason = null;
        navState.lastTargetX = this.targetX;
        navState.lastTargetY = this.targetY;
    }
}
export function prepareHpaReplanPrep(cols, cellToRegion, graphMeta, startIdx, targetIdx) {
    const startRegion = cellToRegion[startIdx];
    const targetRegion = cellToRegion[targetIdx];
    const cellDist = octileDistanceIdx(startIdx, targetIdx, cols);
    if (cellDist < HPA_LOCAL_DISTANCE_THRESHOLD || (startRegion >= 0 && startRegion === targetRegion)) return { mode: "local", startIdx, targetIdx };
    const { nodeIds, nodeIdx } = graphMeta;
    return { mode: "hpa", startIdx, targetIdx, nodeCount: graphMeta.nodeCount, nodeIds, nodeIdx, regionConnectMaxLen: HPA_REGION_CONNECT_MAX_LEN, startRegion, targetRegion };
}
export function findNearestOpenCellIdx(blocked, cols, rows, idx) {
    if (blocked[idx] === 0) return idx;
    const c0 = idx % cols;
    const cellCount = cols * rows;
    for (let r = 1; r <= 5; r++)
        for (let dr = -r; dr <= r; dr++) {
            const nRowIdx = idx + dr * cols;
            if (nRowIdx < 0 || nRowIdx >= cellCount) continue;
            for (let dc = -r; dc <= r; dc++) {
                const nc = c0 + dc;
                if (nc >= 0 && nc < cols) {
                    const nIdx = nRowIdx + dc;
                    if (blocked[nIdx] === 0) return nIdx;
                }
            }
        }
    return idx;
}
// --- MERGED FROM hpaRegionGraph.js ---
export const REGION_CELL_UNASSIGNED = -1;
export class HpaRegionGraph {
    constructor(frame, nodesMap = {}, cellToNode = null, nodeIdCounter = 0) {
        this.frame = frame;
        this.nodesMap = nodesMap;
        this.cellToNode = cellToNode ?? new Int32Array(frame.cols * frame.rows).fill(-1);
        this.nodeIdCounter = nodeIdCounter;
    }
    static fromState(state, frame) {
        return new HpaRegionGraph(frame, state.nodesMap, state.cellToNode, state.nodeIdCounter);
    }
    static fromVoronoiResult(result, frame) {
        return new HpaRegionGraph(frame, result.nodesMap, result.cellToNode, 0);
    }
    exportState() {
        return { nodesMap: this.nodesMap, cellToNode: this.cellToNode, nodeIdCounter: this.nodeIdCounter };
    }
    assignCell(node, idx) {
        if (!node) return;
        this.cellToNode[idx] = node.idx;
        node.cells.push(idx);
    }
    unassignCell(idx) {
        this.cellToNode[idx] = -1;
    }
    nodes() {
        return Object.values(this.nodesMap);
    }
    nodeIds() {
        return Object.keys(this.nodesMap);
    }
    clearEdges(node) {
        if (node) node.edges = [];
    }
    clearAllEdges() {
        for (const node of this.nodes()) this.clearEdges(node);
    }
    connectEdge(nodeA, nodeB) {
        if (!nodeA || !nodeB || nodeA.id === nodeB.id) return;
        const cols = this.frame.cols;
        const costAB = octileDistanceIdx(nodeA.idx, nodeB.idx, cols);
        if (costAB > 0 && !nodeA.edges.some((e) => e.targetId === nodeB.id)) nodeA.edges.push({ targetId: nodeB.id, cost: costAB });
    }
    stripEdgesBetween(nodeA, nodeB) {
        if (!nodeA || !nodeB) return;
        _removeEdgeByTargetId(nodeA.edges, nodeB.id);
        _removeEdgeByTargetId(nodeB.edges, nodeA.id);
    }
    removeInboundEdges(targetId) {
        for (const node of this.nodes()) _removeEdgeByTargetId(node.edges, targetId);
    }
    createRegionAtCell(startIdx) {
        const id = startIdx;
        const node = new RegionNode(id, startIdx);
        this.nodesMap[id] = node;
        return node;
    }
    getNode(idOrIdx) {
        return this.nodesMap[idOrIdx] ?? null;
    }
    nodeForCell(idx) {
        const nodeIdx = this.cellToNode[idx];
        if (nodeIdx === undefined || nodeIdx === -1) return null;
        return this.nodesMap[nodeIdx] ?? null;
    }
    removeRegion(node) {
        if (!node) throw new Error("removeRegion: node must be defined");
        for (let i = 0; i < node.cells.length; i++) this.cellToNode[node.cells[i]] = -1;
        delete this.nodesMap[node.id];
        this.removeInboundEdges(node.id);
    }
    collectRegionIdsInBounds(bounds) {
        const ids = new Set();
        forEachDenseCellInBounds(bounds, this.frame.cols, (idx) => {
            const node = this.nodeForCell(idx);
            if (node) ids.add(node.id);
        });
        return ids;
    }
    stripCellFromRegion(idx) {
        const node = this.nodeForCell(idx);
        if (!node) return null;
        _removeCellByIdx(node.cells, idx);
        this.unassignCell(idx);
        return node;
    }
    syncState(state) {
        state.nodesMap = this.nodesMap;
        state.cellToNode = this.cellToNode;
        state.nodeIdCounter = this.nodeIdCounter;
    }
}
export function expandRegionDamageBounds(idxOrBounds, frame, padding = 12) {
    if (typeof idxOrBounds === "number") return padCellIdxToGrid(idxOrBounds, frame.cols, frame.rows, padding);
    return padCellBoundsToGrid(idxOrBounds, frame.cols, frame.rows, padding);
}
function regionsShareDirectedPassableLink(navGraph, frame, nodeA, nodeB) {
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) return false;
    const { cols, rows } = frame;
    const targetCells = new Set(nodeB.cells);
    for (let i = 0; i < nodeA.cells.length; i++) {
        const idx = nodeA.cells[i];
        let linked = false;
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (linked || !targetCells.has(nIdx)) return;
            if (navGraph.canStepIdx(idx, nIdx)) linked = true;
        });
        if (linked) return true;
    }
    return false;
}
function validateRegionEdges(navGraph, frame, node, graph) {
    if (!node) return;
    node.edges = node.edges.filter((edge) => {
        const other = graph.getNode(edge.targetId);
        return other && regionsShareDirectedPassableLink(navGraph, frame, node, other);
    });
}
function reconnectRegionEdges(navGraph, blocked, frame, graph, node) {
    if (!node) return;
    const { cols, rows } = frame;
    for (const edge of [...node.edges]) graph.stripEdgesBetween(node, graph.getNode(edge.targetId));
    for (const other of graph.nodes()) if (other.id !== node.id) _removeEdgeByTargetId(other.edges, node.id);
    const neighborIds = new Set();
    const nodeCells = node.cells;
    for (let i = 0; i < nodeCells.length; i++) {
        const idx = nodeCells[i];
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (blocked[nIdx]) return;
            if (!navGraph.canStepIdx(idx, nIdx) && !navGraph.canStepIdx(nIdx, idx)) return;
            const other = graph.nodeForCell(nIdx);
            if (other && other.id !== node.id) neighborIds.add(other.id);
        });
    }
    for (const otherId of neighborIds) {
        const other = graph.getNode(otherId);
        if (!other) continue;
        if (regionsShareDirectedPassableLink(navGraph, frame, node, other)) graph.connectEdge(node, other);
        if (regionsShareDirectedPassableLink(navGraph, frame, other, node)) graph.connectEdge(other, node);
    }
}
function createRegionFromCells(cells, blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph) {
    const { cols, rows } = frame;
    if (cells.length === 0) return { newIds: [], nodeIdCounter: graph.nodeIdCounter };
    if (!distToWall || distToWall.length !== cols * rows) distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const unassigned = new Set(cells);
    const starts = [...unassigned].sort((a, b) => distToWall[b] - distToWall[a]);
    const newIds = [];
    for (let s = 0; s < starts.length; s++) {
        const startIdx = starts[s];
        if (!unassigned.has(startIdx)) continue;
        const node = graph.createRegionAtCell(startIdx);
        node.cells.length = 0;
        floodFillRegion(startIdx, node, blocked, frame, graph.cellToNode, node.cells, maxCellsPerChunk, navGraph, unassigned);
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
        newIds.push(node.id);
    }
    if (minCellsPerChunk > 0) mergeSmallRegions(graph.nodesMap, graph.cellToNode, frame, minCellsPerChunk, navGraph);
    repositionRegionCentroids(graph.nodesMap, blocked, frame, graph.cellToNode);
    return { newIds, nodeIdCounter: graph.nodeIdCounter, distToWall };
}
function stripBlockedCellsFromRegions(blocked, frame, bounds, graph) {
    const { cols } = frame;
    const touched = new Set();
    forEachDenseCellInBounds(bounds, cols, (idx) => {
        if (!blocked[idx]) return;
        const node = graph.stripCellFromRegion(idx);
        if (!node) return;
        touched.add(node.id);
    });
    for (const id of [...touched]) {
        const node = graph.getNode(id);
        if (!node) continue;
        if (node.cells.length === 0) {
            graph.removeRegion(node);
            continue;
        }
        repositionNodeCentroid(node, graph.cellToNode, blocked, frame, graph.nodesMap);
    }
}
function repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph, bounds) {
    const { cols } = frame;
    const regionIds = graph.collectRegionIdsInBounds(bounds);
    const cells = new Set();
    for (const id of regionIds) {
        const node = graph.getNode(id);
        if (!node) continue;
        for (let i = 0; i < node.cells.length; i++) cells.add(node.cells[i]);
        graph.removeRegion(node);
    }
    forEachDenseCellInBounds(bounds, cols, (idx) => {
        if (!blocked[idx]) cells.add(idx);
    });
    if (cells.size === 0) return { repackedIds: [], nodeIdCounter: graph.nodeIdCounter, distToWall };
    distToWall = computeDistanceTransform(blocked, frame, distToWall);
    const { newIds, nodeIdCounter: nextCounter, distToWall: dist } = createRegionFromCells([...cells], blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph);
    return { repackedIds: newIds, nodeIdCounter: nextCounter, distToWall: dist };
}
function connectAllNodes(navGraph, blocked, frame, graph) {
    graph.clearAllEdges();
    const { cols, rows } = frame;
    forEachDenseCellInBounds(cellBoundsForGrid(cols, rows), cols, (idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const node = graph.nodeForCell(idx);
        if (!node) return;
        if (col + 1 < cols) {
            const right = graph.nodeForCell(idx + 1);
            if (right && right.id !== node.id) {
                if (navGraph.canStepIdx(idx, idx + 1)) graph.connectEdge(node, right);
                if (navGraph.canStepIdx(idx + 1, idx)) graph.connectEdge(right, node);
            }
        }
        if (row + 1 < rows) {
            const down = graph.nodeForCell(idx + cols);
            if (down && down.id !== node.id) {
                if (navGraph.canStepIdx(idx, idx + cols)) graph.connectEdge(node, down);
                if (navGraph.canStepIdx(idx + cols, idx)) graph.connectEdge(down, node);
            }
        }
    });
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
}
function pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY) {
    const { cols, rows } = frame;
    const { col, row } = snapshotWorldToGrid(frame, seedWorldX, seedWorldY);
    const seedIdx = row * cols + col;
    const startIdx = findNearestOpenCellIdx(blocked, cols, rows, seedIdx);
    const reachable = new Uint8Array(cols * rows);
    reachable[startIdx] = 1;
    bfsIndices([startIdx], (idx, enqueue) => {
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (blocked[nIdx] || reachable[nIdx]) return;
            if (!navGraph.canStepIdx(idx, nIdx)) return;
            reachable[nIdx] = 1;
            enqueue(nIdx);
        });
    });
    for (const node of graph.nodes()) {
        let hasReachableCell = false;
        for (let i = 0; i < node.cells.length; i++)
            if (reachable[node.cells[i]]) {
                hasReachableCell = true;
                break;
            }
        if (hasReachableCell) continue;
        graph.removeRegion(node);
    }
    for (const node of graph.nodes()) for (let i = node.edges.length - 1; i >= 0; i--) if (!graph.getNode(node.edges[i].targetId)) node.edges.splice(i, 1);
}
function pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph) {
    const seedWorldX = frame.minX + frame.cols * frame.cellSize * 0.5;
    const seedWorldY = frame.minY + frame.rows * frame.cellSize * 0.5;
    pruneUnreachableRegions(navGraph, blocked, frame, graph, seedWorldX, seedWorldY);
}
export function buildFullRegionGraph(opts) {
    const { blocked, frame, navGraph, maxCellsPerChunk, minCellsPerChunk } = opts;
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Int32Array(size).fill(-1);
    const distToWall = computeDistanceTransform(blocked, frame);
    const result = generateVoronoiRegions({ grid: blocked, distToWall, frame, maxCellsPerChunk, minCellsPerChunk, cellToNode, navGraph });
    const graph = HpaRegionGraph.fromVoronoiResult(result, frame);
    connectAllNodes(navGraph, blocked, frame, graph);
    pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph);
    return { ...graph.exportState(), graph };
}
export function rebuildDamagedRegionGraph(state, bounds, frame, blocked, navGraph) {
    const { maxCellsPerChunk, minCellsPerChunk, damagePadding = 12 } = state;
    const { cols, rows } = frame;
    if (!bounds || cols === 0 || rows === 0) return state;
    const graph = state.graph instanceof HpaRegionGraph ? state.graph : HpaRegionGraph.fromState(state, frame);
    graph.frame = frame;
    let distToWall = state.distToWall;
    const box = expandRegionDamageBounds(bounds, frame, damagePadding);
    stripBlockedCellsFromRegions(blocked, frame, box, graph);
    const { repackedIds, nodeIdCounter, distToWall: dist } = repackHullRegions(blocked, frame, maxCellsPerChunk, minCellsPerChunk, navGraph, distToWall, graph, box);
    graph.nodeIdCounter = nodeIdCounter;
    graph.syncState(state);
    state.graph = graph;
    state.nodeIdCounter = nodeIdCounter;
    state.distToWall = dist;
    const reconnectIds = new Set(repackedIds);
    for (const id of graph.collectRegionIdsInBounds(box)) reconnectIds.add(id);
    for (const id of reconnectIds) reconnectRegionEdges(navGraph, blocked, frame, graph, graph.getNode(id));
    for (const node of graph.nodes()) validateRegionEdges(navGraph, frame, node, graph);
    pruneUnreachableRegionsFromGridCenter(navGraph, blocked, frame, graph);
    graph.syncState(state);
    return state;
}
export function packRegionGraphFlat(nodesMap, cellToNode, frame) {
    const graph = nodesMap instanceof HpaRegionGraph ? nodesMap : new HpaRegionGraph(frame, nodesMap, cellToNode);
    const size = frame.cols * frame.rows;
    const cellToRegion = new Int16Array(size);
    cellToRegion.fill(REGION_CELL_UNASSIGNED);
    const idToIdx = new Int32Array(size);
    idToIdx.fill(-1);
    const nodes = Object.values(graph.nodesMap);
    const nodeCount = nodes.length;
    const nodeIdx = new Int32Array(nodeCount);
    const nodeIds = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        nodeIds[i] = node.id;
        idToIdx[node.id] = i;
        nodeIdx[i] = node.idx;
        for (let c = 0; c < node.cells.length; c++) cellToRegion[node.cells[c]] = i;
    }
    const edgeSources = [];
    const edgeTargets = [];
    const edgeCosts = [];
    for (let i = 0; i < nodeCount; i++) {
        const edges = nodes[i].edges;
        for (let e = 0; e < edges.length; e++) {
            const targetIdx = idToIdx[edges[e].targetId];
            if (targetIdx === -1) continue;
            edgeSources.push(i);
            edgeTargets.push(targetIdx);
            edgeCosts.push(edges[e].cost);
        }
    }
    return {
        nodeCount,
        nodeIdx,
        cellToRegion,
        edgeSources: Int16Array.from(edgeSources),
        edgeTargets: Int16Array.from(edgeTargets),
        edgeCosts: Uint16Array.from(edgeCosts),
        edgeWrite: edgeSources.length,
        nodeIds,
        idToIdx,
    };
}
export function unpackRegionGraphToNodes(cellToRegion, nodeIdx, nodeCount, frame) {
    const { cols, rows } = frame;
    const size = cols * rows;
    const cellToNode = new Int32Array(size).fill(-1);
    const nodesMap = {};
    for (let i = 0; i < nodeCount; i++) {
        const id = nodeIdx[i];
        const idx = nodeIdx[i];
        const node = new RegionNode(id, idx);
        node.cells = [];
        nodesMap[id] = node;
    }
    for (let idx = 0; idx < size; idx++) {
        const regionIdx = cellToRegion[idx];
        if (regionIdx < 0) continue;
        const node = nodesMap[nodeIdx[regionIdx]];
        cellToNode[idx] = node.idx;
        node.cells.push(idx);
    }
    return { nodesMap, cellToNode, nodeIdCounter: nodeCount };
}
// --- MERGED FROM NavTopology.js ---
/** @typedef {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/** @typedef {import("../Pathfinding/HpaPathWorker.js").HpaPathWorker} HpaPathWorker */
/** @typedef {import("../DataStructures/CellRect.js").CellBounds} CellBounds */
/** @type {WeakMap<WorldObstacleGrid, import("../Pathfinding/navTopologySab.js").NavTopologySabArena>} */
const localBakeArenas = new WeakMap();
/**
 * Baked nav walkability — one object for worker-synced and in-process bakes.
 * Octile reads for movement; cardinal/vertex reads for belt-mouth heuristics.
 */
export class NavTopology {
    /** @param {WorldObstacleGrid} grid @param {{ worker?: HpaPathWorker | null }} [options] */
    constructor(grid, { worker = null } = {}) {
        this.grid = grid;
        /** @type {HpaPathWorker | null} */
        this._worker = worker;
        /** @type {import("../Pathfinding/GridNavSnapshot.js").GridFrame | null} */
        this._frame = null;
        /** @type {import("../Pathfinding/navTopologySab.js").NavTopology | null} */
        this._topology = null;
        /** @type {"worker" | "local" | null} */
        this._source = worker ? "worker" : null;
    }
    /** @param {HpaPathWorker} worker */
    bindWorker(worker) {
        this._worker = worker;
        this._source = "worker";
    }
    /** @param {import("../Pathfinding/GridNavSnapshot.js").GridFrame} frame @param {import("../Pathfinding/navTopologySab.js").NavTopology} topology */
    bindWorkerSync(frame, topology) {
        this._frame = frame;
        this._topology = topology;
        this._source = "worker";
    }
    invalidateLocalBake() {
        if (this._source !== "local") return;
        if (this.grid._navTopologyRef === this) this.grid._navTopologyRef = null;
        this._frame = null;
        this._topology = null;
        this._source = null;
    }
    isReady() {
        if (this._worker) return isNavTopologyReady(this._worker, this.grid);
        return !!(this._frame && this._topology);
    }
    get wallRevision() {
        return this.grid.wallGridRevision;
    }
    get frame() {
        if (this._worker?.getGridFrame()) return this._worker.getGridFrame();
        return this._frame;
    }
    get topology() {
        if (this._worker) return this._worker.getNavTopology();
        return this._topology;
    }
    get navCardinalOpen() {
        return this._worker?.getNavArena()?.cardinalOpen ?? this._localArena()?.cardinalOpen ?? null;
    }
    get vertexPassability() {
        return this._worker?.getNavArena()?.vertexPassability ?? this._localArena()?.vertexPassability ?? null;
    }
    /** Octile CSR step — movement, HPA, flow. */
    canStep(fromIdx, toIdx) {
        if (!this.isReady()) return false;
        const frame = this.frame;
        const topology = this.topology;
        if (frame && topology) return navCanStep(frame, topology, fromIdx, toIdx);
        const cardinalOpen = this.navCardinalOpen;
        const vertexPassability = this.vertexPassability;
        if (cardinalOpen && vertexPassability) return !boundaryBlocksStepFrom(this.grid, cardinalOpen, vertexPassability, fromIdx, toIdx);
        return false;
    }
    /**
     * In-process bake using the same functions as the worker (authoring / map-gen).
     *
     * @param {number | null} [idx]
     */
    bakeInProcess(idx = null) {
        const arena = ensureLocalBakeArena(this.grid);
        packNavTopologyFromGrid(this.grid, arena, idx);
        const frame = gridFrameFromGrid(this.grid);
        const simView = createNavSimView(frame, arena.gridFill, arena.floorKind, arena.floorFacing, arena.edgeSlots, this.grid.cellEdgePool, arena.vertexPassability);
        const topology = navTopologyFromArena(arena);
        topology.octilePredecessors = arena.octilePredecessors;
        bakeNavTopologyIntoArena(simView, topology, arena.cardinalOpen, arena.vertexPassability, idx);
        this._frame = frame;
        this._topology = topology;
        this._source = "local";
        if (!this._worker) this.grid._navTopologyRef = this;
        return this;
    }
    /** @param {WorldObstacleGrid} grid @param {number | null} [idx] */
    static bakeLocal(grid, idx = null) {
        return new NavTopology(grid).bakeInProcess(idx);
    }
    /** @param {WorldObstacleGrid} grid @param {HpaPathWorker} worker */
    static bindWorker(grid, worker) {
        return new NavTopology(grid, { worker });
    }
    /** @param {WorldObstacleGrid} grid @param {number | null} [idx] */
    static packSnapshot(grid, idx = null) {
        const arena = ensureLocalBakeArena(grid);
        packNavTopologyFromGrid(grid, arena, idx);
        return { gridFill: arena.gridFill, floorKind: arena.floorKind, floorFacing: arena.floorFacing, edgeSlots: arena.edgeSlots, edgePool: grid.cellEdgePool };
    }
    _localArena() {
        return localBakeArenas.get(this.grid) ?? null;
    }
}
/** @param {WorldObstacleGrid} grid */
function ensureLocalBakeArena(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    let arena = localBakeArenas.get(grid);
    if (!arena || arena.cellCount !== cellCount) {
        arena = createNavTopologySabArena(cellCount, vertCount, grid.cols, grid.rows);
        localBakeArenas.set(grid, arena);
    }
    return arena;
}
/** @param {WorldObstacleGrid} grid */
export function invalidateGridLocalNavBake(grid) {
    localBakeArenas.delete(grid);
    if (grid._navTopologyRef?.invalidateLocalBake) grid._navTopologyRef.invalidateLocalBake();
}
/**
 * One bake pass: blocked → vertex → cardinal → octile → predecessors.
 * Shared by the HPA worker and in-process authoring/tests.
 *
 * @param {ReturnType<typeof createNavSimView>} simView
 * @param {import("../Pathfinding/navTopologySab.js").NavTopology & { octilePredecessors?: Int32Array }} topology
 * @param {Uint8Array} cardinalOpen
 * @param {Uint8Array} vertexPassability
 * @param {number | object | null} idx
 */
export function bakeNavTopologyIntoArena(simView, topology, cardinalOpen, vertexPassability, idx = null) {
    const frame = simView.frame;
    const { cols, rows } = frame;
    const isBounds = idx !== null && typeof idx === "object";
    const bakeBounds = idx !== null ? (isBounds ? idx : padCellIdxToGrid(idx, cols, rows, 1)) : null;
    if (isBounds)
        forEachDenseCellInBounds(idx, cols, (cellIdx) => {
            recomputeBlockedFromGridFill(simView.grid, topology.blocked, cols, cellIdx);
        });
    else recomputeBlockedFromGridFill(simView.grid, topology.blocked, cols, idx);
    recomputeVertexPassabilityInto(simView, vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(simView, cardinalOpen, vertexPassability, bakeBounds);
    buildOctileNeighborsFromTopologyBounds(topology.blocked, cardinalOpen, vertexPassability, cols, rows, topology.octileNeighbors, bakeBounds ?? cellBoundsForGrid(cols, rows));
    if (topology.octilePredecessors) buildOctilePredecessorsFromForwardGrid(topology.octileNeighbors, topology.octilePredecessors, cols, rows, bakeBounds);
}
/**
 * Bake nav topology in-process from the live grid (cell + edge snapshot).
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds]
 */
export function bakeNavTopologyLocal(grid, damageBounds = null) {
    const navTopology = NavTopology.bakeLocal(grid, damageBounds);
    return { frame: navTopology.frame, topology: navTopology.topology, simView: null, cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability, navTopology };
}
/**
 * Capture the worker bake input snapshot from a live grid.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} [bounds]
 */
export function captureNavGridSnapshot(grid, bounds = null) {
    return NavTopology.packSnapshot(grid, bounds);
}
// --- MERGED FROM navTopologySab.js ---
/** Octile step slots per cell in nav snapshot CSR. */
export const OCTILE_DIRS_PER_CELL = 8;
export const OCTILE_NEIGHBOR_BYTES = OCTILE_DIRS_PER_CELL * 4;
// Precalculated array for the inverse of each octile offset.
// Order of OCTILE_OFFSETS: N, NE, E, SE, S, SW, W, NW
// Their opposites are:     S, SW, W, NW, N, NE, E, SE
// Which corresponds to indices: 4, 5, 6, 7, 0, 1, 2, 3
const OCTILE_REVERSE_DIR = [4, 5, 6, 7, 0, 1, 2, 3];
/** @param {number} cellIdx */
export function octileNeighborBase(cellIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL;
}
/** @param {number} cellIdx @param {number} dirIdx */
export function octileNeighborOffset(cellIdx, dirIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL + dirIdx;
}
/** @typedef {{ blocked: Uint8Array, octileNeighbors: Int32Array }} NavTopology */
/**
 * @typedef {object} NavTopologySabArena
 * @property {number} cellCount
 * @property {SharedArrayBuffer} sabBlocked
 * @property {SharedArrayBuffer} sabGridFill
 * @property {SharedArrayBuffer} sabFloorKind
 * @property {SharedArrayBuffer} sabFloorFacing
 * @property {SharedArrayBuffer} sabEdgeSlots
 * @property {SharedArrayBuffer} sabOctileNeighbors
 * @property {SharedArrayBuffer} sabOctilePredecessors
 * @property {SharedArrayBuffer} sabCardinalOpen
 * @property {SharedArrayBuffer} sabVertexPassability
 * @property {Uint8Array} blocked
 * @property {Uint8Array} gridFill
 * @property {Uint8Array} floorKind
 * @property {Uint8Array} floorFacing
 * @property {Int32Array} edgeSlots
 * @property {Int32Array} octileNeighbors
 * @property {Int32Array} octilePredecessors
 * @property {Uint8Array} cardinalOpen
 * @property {Uint8Array} vertexPassability
 * @property {NavTopology} topologyHandle
 */
/** @param {NavTopologySabArena} arena @returns {NavTopology} */
export function navTopologyFromArena(arena) {
    return arena.topologyHandle;
}
/** @param {ArrayBufferLike} sabBlocked @param {ArrayBufferLike} sabOctileNeighbors @param {ArrayBufferLike} sabOctilePredecessors @returns {NavTopology & { octilePredecessors: Int32Array }} */
export function navTopologyFromSab(sabBlocked, sabOctileNeighbors, sabOctilePredecessors) {
    return { blocked: new Uint8Array(sabBlocked), octileNeighbors: new Int32Array(sabOctileNeighbors), octilePredecessors: new Int32Array(sabOctilePredecessors) };
}
/** @param {number} cellCount @param {number} vertCount */
export function createNavTopologySabArena(cellCount, vertCount, cols = 0, rows = 0) {
    const vertBytes = Math.max(vertCount, 4);
    const expCellCount = cols > 0 && rows > 0 ? (cols + 1) * (rows + 1) : cellCount;
    /** @type {NavTopologySabArena} */
    const arena = {
        cellCount,
        sabBlocked: new SharedArrayBuffer(cellCount),
        sabGridFill: new SharedArrayBuffer(cellCount),
        sabFloorKind: new SharedArrayBuffer(cellCount),
        sabFloorFacing: new SharedArrayBuffer(cellCount),
        sabEdgeSlots: new SharedArrayBuffer(expCellCount * CELL_EDGE_SLOT_BYTES),
        sabOctileNeighbors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES),
        sabOctilePredecessors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES),
        sabCardinalOpen: new SharedArrayBuffer(cellCount),
        sabVertexPassability: new SharedArrayBuffer(vertBytes),
        blocked: undefined,
        gridFill: undefined,
        floorKind: undefined,
        floorFacing: undefined,
        edgeSlots: undefined,
        octileNeighbors: undefined,
        octilePredecessors: undefined,
        cardinalOpen: undefined,
        vertexPassability: undefined,
        topologyHandle: undefined,
    };
    bindNavTopologySabViews(arena);
    return arena;
}
/** @param {NavTopologySabArena} arena */
export function bindNavTopologySabViews(arena) {
    arena.blocked = new Uint8Array(arena.sabBlocked);
    arena.gridFill = new Uint8Array(arena.sabGridFill);
    arena.floorKind = new Uint8Array(arena.sabFloorKind);
    arena.floorFacing = new Uint8Array(arena.sabFloorFacing);
    arena.edgeSlots = new Int32Array(arena.sabEdgeSlots);
    arena.octileNeighbors = new Int32Array(arena.sabOctileNeighbors);
    arena.octilePredecessors = new Int32Array(arena.sabOctilePredecessors);
    arena.cardinalOpen = new Uint8Array(arena.sabCardinalOpen);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
    if (!arena.topologyHandle) arena.topologyHandle = { blocked: arena.blocked, octileNeighbors: arena.octileNeighbors };
    else {
        arena.topologyHandle.blocked = arena.blocked;
        arena.topologyHandle.octileNeighbors = arena.octileNeighbors;
    }
}
/** @param {NavTopologySabArena} arena @param {number} vertCount */
export function growNavTopologyVertexSab(arena, vertCount) {
    const vertBytes = Math.max(vertCount, 4);
    if (arena.sabVertexPassability.byteLength >= vertBytes) return;
    arena.sabVertexPassability = new SharedArrayBuffer(vertBytes);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
}
export function expandNavTopologyBakeBounds(bounds, cols, rows, padding = 1) {
    return padCellBoundsToGrid(bounds, cols, rows, padding);
}
export function packNavTopologyFromGrid(grid, arena, idx = null) {
    const isBounds = idx !== null && typeof idx === "object";
    if (idx === null) {
        arena.gridFill.set(grid.grid);
        arena.floorKind.set(grid.floorKind);
        arena.floorFacing.set(grid.floorFacing);
        arena.edgeSlots.set(grid.cellEdgeSlots);
        return;
    }
    if (isBounds)
        forEachDenseCellInBounds(idx, grid.cols, (cellIdx) => {
            arena.gridFill[cellIdx] = grid.grid[cellIdx];
            arena.floorKind[cellIdx] = grid.floorKind[cellIdx];
            arena.floorFacing[cellIdx] = grid.floorFacing[cellIdx];
            for (let side = 0; side < 4; side++) {
                const offset = cellEdgeSlotOffset(cellIdx, side);
                arena.edgeSlots[offset] = grid.cellEdgeSlots[offset];
            }
        });
    else {
        arena.gridFill[idx] = grid.grid[idx];
        arena.floorKind[idx] = grid.floorKind[idx];
        arena.floorFacing[idx] = grid.floorFacing[idx];
        for (let side = 0; side < 4; side++) {
            const offset = cellEdgeSlotOffset(idx, side);
            arena.edgeSlots[offset] = grid.cellEdgeSlots[offset];
        }
    }
}
/** @param {Uint8Array} gridFill @param {Uint8Array} blocked @param {number} cols @param {number | null} idx */
export function recomputeBlockedFromGridFill(gridFill, blocked, cols, idx = null) {
    if (idx === null) {
        for (let i = 0; i < gridFill.length; i++) blocked[i] = gridFill[i] !== 0 ? 1 : 0;
        return;
    }
    blocked[idx] = gridFill[idx] !== 0 ? 1 : 0;
}
export function buildOctileNeighborsFromTopologyBounds(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, bounds) {
    forEachDenseCellInBounds(bounds, cols, (idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const base = octileNeighborBase(idx);
        if (blocked[idx]) {
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) octileNeighbors[base + i] = -1;
            return;
        }
        for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
            const { dc, dr } = OCTILE_OFFSETS[i];
            const nc = col + dc;
            const nr = row + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const nIdx = nr * cols + nc;
            if (!cellInRect(nIdx, cols, rows)) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            if (blocked[nIdx]) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & getCardinalBit(dc, dr)) !== 0 : diagonalStepOpen(cardinalOpen, vertexPassability, cols, rows, idx, dc, dr);
            octileNeighbors[octileNeighborOffset(idx, i)] = open ? nIdx : -1;
        }
    });
}
/** @param {Int32Array} octileNeighbors @param {Int32Array} octilePredecessors @param {number} cols @param {number} rows @param {import("../DataStructures/CellRect.js").CellBounds | null} targetBounds */
export function buildOctilePredecessorsFromForwardGrid(octileNeighbors, octilePredecessors, cols, rows, targetBounds = null) {
    const cellCount = cols * rows;
    if (!targetBounds) octilePredecessors.fill(-1);
    else
        forEachDenseCellInRect(targetBounds.startCol, targetBounds.endCol, targetBounds.startRow, targetBounds.endRow, cols, (idx) => {
            const base = octileNeighborBase(idx);
            for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) octilePredecessors[base + i] = -1;
        });
    for (let idx = 0; idx < cellCount; idx++) {
        const base = octileNeighborBase(idx);
        for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) {
            const nIdx = octileNeighbors[base + i];
            if (nIdx < 0) continue;
            if (targetBounds) {
                const col = nIdx % cols;
                const row = (nIdx / cols) | 0;
                if (col < targetBounds.startCol || col > targetBounds.endCol || row < targetBounds.startRow || row > targetBounds.endRow) continue;
            }
            octilePredecessors[octileNeighborOffset(nIdx, OCTILE_REVERSE_DIR[i])] = idx;
        }
    }
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology @param {number} col @param {number} row */
export function navIsBlocked(frame, topology, col, row) {
    const { cols, rows } = frame;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return true;
    const idx = row * cols + col;
    if (!cellInRect(idx, cols, rows)) return true;
    return topology.blocked[idx] !== 0;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function navCanStep(frame, topology, fromIdx, toIdx) {
    if (fromIdx < 0 || toIdx < 0) return false;
    const { cols, rows } = frame;
    const cellCount = cols * rows;
    if (fromIdx >= cellCount || toIdx >= cellCount) return false;
    if (topology.blocked[fromIdx]) return false;
    for (let dirIdx = 0; dirIdx < 8; dirIdx++) if (topology.octileNeighbors[octileNeighborOffset(fromIdx, dirIdx)] === toIdx) return true;
    return false;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function createNavLocalView(frame, topology) {
    return { canStepIdx: (fromIdx, toIdx) => navCanStep(frame, topology, fromIdx, toIdx) };
}
// --- MERGED FROM navSimView.js ---
/**
 * Minimal grid shape for nav topology bake (main packs SABs; worker reads this view).
 * @param {import("./GridNavSnapshot.js").GridFrame} frame
 * @param {Uint8Array} gridFill
 * @param {Uint8Array} floorKind
 * @param {Uint8Array} floorFacing
 * @param {Int32Array} edgeSlots
 * @param {object[]} edgePool
 * @param {Uint8Array} vertexPassability
 */
export function createNavSimView(frame, gridFill, floorKind, floorFacing, edgeSlots, edgePool, vertexPassability) {
    const simView = {
        frame,
        grid: gridFill,
        vertexPassability,
        cellEdgeSlots: edgeSlots,
        cellEdgePool: edgePool,
        floorKind: floorKind,
        floorFacing: floorFacing,
        getCellEdge(idx, side) {
            const ref = edgeSlots[cellEdgeSlotOffset(idx, side)];
            if (ref < 0) return null;
            return simView.cellEdgePool[ref];
        },
        hasAnyCellEdgeAtIdx(idx) {
            const base = idx << 2;
            return edgeSlots[base] !== -1 || edgeSlots[base + 1] !== -1 || edgeSlots[base + 2] !== -1 || edgeSlots[base + 3] !== -1;
        },
        isBlocked(col, row) {
            return gridFill[row * frame.cols + col] !== 0;
        },
        isBlockedIdx(idx) {
            if (idx < 0 || idx >= gridFill.length) return true;
            return gridFill[idx] !== 0;
        },
    };
    Object.defineProperties(simView, {
        cols: {
            get() {
                return frame.cols;
            },
            enumerable: true,
        },
        rows: {
            get() {
                return frame.rows;
            },
            enumerable: true,
        },
        minX: {
            get() {
                return frame.minX;
            },
            enumerable: true,
        },
        minY: {
            get() {
                return frame.minY;
            },
            enumerable: true,
        },
        cellSize: {
            get() {
                return frame.cellSize;
            },
            enumerable: true,
        },
    });
    return simView;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {object[]} edgePool */
export function bindNavSimEdgePool(simView, edgePool) {
    simView.cellEdgePool = edgePool;
}
/** @param {ReturnType<typeof createNavSimView>} simView @param {import("./GridNavSnapshot.js").GridFrame} frame */
export function bindNavSimGridFrame(simView, frame) {
    simView.frame = frame;
}
// --- MERGED FROM navGraph.js ---
/** @typedef {number} CellIdx */
export function beltEntryNeighborAtIdx(grid, idx) {
    const sides = FloorBelt.getEntryExitAtIdx(grid, idx);
    if (!sides) return -1;
    return edgeNeighborIdx(idx, sides.entrySide, grid.cols, grid.rows);
}
export function createNavGraphView(grid, baked = null, navTopology = null) {
    const topologyRef = navTopology ?? grid._navTopologyRef;
    const frame = topologyRef?.frame ?? null;
    const topology = topologyRef?.topology ?? null;
    return {
        grid,
        frame,
        topology,
        cardinalOpen: baked?.cardinalOpen ?? null,
        vertexPassability: baked?.vertexPassability ?? null,
        isBlockedIdx(idx) {
            return grid.grid[idx] !== 0;
        },
        canStepIdx(fromIdx, toIdx) {
            if (topologyRef) return topologyRef.canStep(fromIdx, toIdx);
            if (this.cardinalOpen && this.vertexPassability) return !boundaryBlocksStepFrom(grid, this.cardinalOpen, this.vertexPassability, fromIdx, toIdx);
            return false;
        },
    };
}
/** Snap a path goal cell to the belt entry neighbor (belt-mouth approach). */
export function snapNavGoalCellIndex(grid, fromIdx, targetIdx) {
    if (!FloorBelt.isBelt(grid.floorKind[targetIdx])) return targetIdx;
    const neighborIdx = beltEntryNeighborAtIdx(grid, targetIdx);
    if (neighborIdx === -1 || grid.grid[neighborIdx] !== 0) return targetIdx;
    if (fromIdx === neighborIdx) return targetIdx;
    return neighborIdx;
}
/**
 * Snap a world-space steer/path goal — cell snap when upstream, entry-edge point when targeting a belt cell.
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function snapNavGoalWorldInto(out, grid, fromX, fromY, targetX, targetY) {
    const cols = grid.cols;
    const rows = grid.rows;
    const fromCol = grid.worldCol(fromX);
    const fromRow = grid.worldRow(fromY);
    const targetCol = grid.worldCol(targetX);
    const targetRow = grid.worldRow(targetY);
    if (targetCol < 0 || targetCol >= cols || targetRow < 0 || targetRow >= rows) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const targetIdx = targetCol + targetRow * cols;
    if (!cellInRect(targetIdx, cols, rows)) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const fromIdx = fromCol + fromRow * cols;
    const snappedIdx = snapNavGoalCellIndex(grid, fromIdx, targetIdx);
    if (snappedIdx !== targetIdx) {
        out.x = grid.gridCenterXByIdx(snappedIdx);
        out.y = grid.gridCenterYByIdx(snappedIdx);
        return out;
    }
    if (!FloorBelt.isBelt(grid.floorKind[targetIdx]) || fromIdx === targetIdx) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const sides = FloorBelt.getEntryExitAtIdx(grid, targetIdx);
    if (!sides) {
        out.x = targetX;
        out.y = targetY;
        return out;
    }
    const pt = FloorBelt.getEntryEdgeWorldPoint(grid, targetIdx, sides.entrySide);
    out.x = pt.x;
    out.y = pt.y;
    return out;
}
export function snapNavGoalWorld(grid, fromX, fromY, targetX, targetY) {
    return snapNavGoalWorldInto({ x: 0, y: 0 }, grid, fromX, fromY, targetX, targetY);
}
/** @param {number[]} cellIndices */
export function validateBeltChain(graph, cellIndices) {
    if (cellIndices.length < 2) return { ok: true };
    const { grid } = graph;
    const cols = grid.cols;
    for (let i = 0; i < cellIndices.length - 1; i++) {
        const a = cellIndices[i];
        const b = cellIndices[i + 1];
        const kindA = grid.floorKind[a];
        const facingA = grid.floorFacing[a];
        const kindB = grid.floorKind[b];
        const facingB = grid.floorFacing[b];
        const { exitSide } = FloorBelt.getEntryExitSides(kindA, facingA);
        const { entrySide } = FloorBelt.getEntryExitSides(kindB, facingB);
        const diff = b - a;
        let stepSide = -1;
        if (diff === 1 && (a + 1) % cols !== 0) stepSide = 1;
        else if (diff === -1 && a % cols !== 0) stepSide = 3;
        else if (diff === cols) stepSide = 2;
        else if (diff === -cols) stepSide = 0;
        if (stepSide !== exitSide) return { ok: false, reason: `cell ${i} exit ${exitSide} ≠ step ${stepSide} toward ${i + 1}` };
        const reverseSide = stepSide === 1 ? 3 : stepSide === 3 ? 1 : stepSide === 2 ? 0 : 2;
        if (reverseSide !== entrySide) return { ok: false, reason: `cell ${i + 1} entry ${entrySide} ≠ approach ${reverseSide}` };
        if (!graph.canStepIdx(a, b)) return { ok: false, reason: `canStep blocked ${i}→${i + 1}` };
        if (graph.canStepIdx(b, a)) return { ok: false, reason: `reverse canStep open ${i + 1}→${i}` };
    }
    return { ok: true };
}
/** Worker-synced nav topology → graph view (map-gen, vision, belt endpoints). */
export function createNavGraphViewFromTopology(navTopology) {
    return createNavGraphView(navTopology.grid, { cardinalOpen: navTopology.navCardinalOpen, vertexPassability: navTopology.vertexPassability }, navTopology);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../DataStructures/CellRect.js").CellBounds | null} [damageBounds] */
export function canStepForAuthoringIdx(grid, fromIdx, toIdx, damageBounds = null) {
    return createNavGraphViewWithLocalBake(grid, damageBounds).canStepIdx(fromIdx, toIdx);
}
/** @param {ReturnType<typeof createNavGraphView>} graph @param {number[]} cellIndices */
export function canStepPathIdx(graph, cellIndices) {
    for (let i = 0; i < cellIndices.length - 1; i++) if (!graph.canStepIdx(cellIndices[i], cellIndices[i + 1])) return false;
    return true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function createNavGraphViewWithLocalBake(grid, damageBounds = null) {
    const baked = bakeNavTopologyLocal(grid, damageBounds);
    return createNavGraphView(grid, { cardinalOpen: baked.cardinalOpen, vertexPassability: baked.vertexPassability }, baked.navTopology);
}
// --- MERGED FROM HpaPathSession.js ---
export class HpaPathSession {
    constructor(hpaPathWorker, { frameStartBudget = HPA_REPLAN_FRAME_START_BUDGET, peakInflightCap = HPA_REPLAN_PEAK_INFLIGHT_CAP } = {}) {
        this.worker = hpaPathWorker;
        this._frameStartBudget = frameStartBudget;
        this._peakInflightCap = Math.min(peakInflightCap, MAX_HPA_REPLAN_SLOTS);
        this._nextRequestId = 1;
        this._pendingRequests = new WeakMap();
        this._replanPriority = new WeakMap();
        this._lastReplanFrame = new WeakMap();
        this._draining = new WeakSet();
        this._queuedNavStates = new WeakSet();
        this._waitQueue = [];
        this._activeWorkerCount = 0;
        this._slotWaiters = [];
        this._frameId = 0;
        this._frameStartsUsed = 0;
        this._peakInflightSeen = 0;
    }
    isReplanInFlight(navState) {
        return navState.hpaReplanRequestId !== 0;
    }
    getInflightCount() {
        return this._activeWorkerCount;
    }
    getPeakInflightReplans() {
        return this._peakInflightSeen;
    }
    resetPeakInflightReplans() {
        this._peakInflightSeen = 0;
    }
    beginFrame(frameId) {
        if (frameId != null && frameId === this._frameId) return;
        this._frameId = frameId ?? this._frameId + 1;
        this._frameStartsUsed = 0;
    }
    flushFrame() {
        this._pumpQueue();
    }
    requestReplan(navState, request, priority = 0) {
        const lastFrame = this._lastReplanFrame.get(navState) ?? -9999;
        if (this._frameId - lastFrame < 15) return false;
        this._lastReplanFrame.set(navState, this._frameId);
        this._pendingRequests.set(navState, request);
        this._replanPriority.set(navState, priority);
        navState.hpaReplanRequestId = this._nextRequestId++;
        if (this._draining.has(navState)) return true;
        this._enqueue(navState);
        return true;
    }
    _canStartDrain() {
        return this._activeWorkerCount < this._peakInflightCap && this._frameStartsUsed < this._frameStartBudget;
    }
    _startDrain(navState) {
        if (this._draining.has(navState) || navState.hpaReplanRequestId === 0) return false;
        this._frameStartsUsed++;
        this._draining.add(navState);
        void this._drainReplan(navState);
        return true;
    }
    _enqueue(navState) {
        if (this._queuedNavStates.has(navState)) {
            this._resortQueued(navState);
            return;
        }
        this._queuedNavStates.add(navState);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _resortQueued(navState) {
        const idx = this._waitQueue.indexOf(navState);
        if (idx >= 0) this._waitQueue.splice(idx, 1);
        this._waitQueue.push(navState);
        this._sortWaitQueue();
    }
    _sortWaitQueue() {
        this._waitQueue.sort((a, b) => (this._replanPriority.get(b) ?? 0) - (this._replanPriority.get(a) ?? 0));
    }
    _pumpQueue() {
        while (this._waitQueue.length > 0 && this._canStartDrain()) {
            const navState = this._waitQueue.shift();
            this._queuedNavStates.delete(navState);
            if (navState.hpaReplanRequestId === 0 || this._draining.has(navState)) continue;
            this._startDrain(navState);
        }
    }
    _recordInflightPeak() {
        if (this._activeWorkerCount > this._peakInflightSeen) this._peakInflightSeen = this._activeWorkerCount;
    }
    _releaseWorkerSlot() {
        this._activeWorkerCount--;
        while (this._slotWaiters.length) this._slotWaiters.shift()();
        this._pumpQueue();
    }
    async _awaitWorkerSlot() {
        while (this._activeWorkerCount >= this._peakInflightCap)
            await new Promise((resolve) => {
                this._slotWaiters.push(resolve);
            });
    }
    async _drainReplan(navState) {
        try {
            while (navState.hpaReplanRequestId !== 0) {
                await this._awaitWorkerSlot();
                if (navState.hpaReplanRequestId === 0) break;
                const requestId = navState.hpaReplanRequestId;
                const request = this._pendingRequests.get(navState);
                this._activeWorkerCount++;
                this._recordInflightPeak();
                let workerOut = null;
                try {
                    workerOut = await this.worker.requestPath(request, navState);
                } catch (err) {
                    console.error("HPA replan failed", err);
                    if (navState.hpaReplanRequestId === requestId) navState.hpaReplanRequestId = 0;
                    break;
                } finally {
                    this._releaseWorkerSlot();
                }
                if (navState.hpaReplanRequestId !== requestId) {
                    if (workerOut?.result?.pathSlot >= 0) this.worker.releaseSlot(workerOut.result.pathSlot);
                    continue;
                }
                navState.hpaReplanRequestId = 0;
                if (!workerOut?.result) {
                    this.worker.releaseOwnedPathSlot(navState);
                    request.applyResult(navState, this.worker, null);
                } else request.applyResult(navState, this.worker, workerOut.result);
            }
        } finally {
            this._draining.delete(navState);
            if (navState.hpaReplanRequestId !== 0) this._enqueue(navState);
        }
    }
}
// --- MERGED FROM navSession.js ---
/**
 * Per-entity navigation session — mutated by path-follow compute and game replan policy.
 */
/**
 * @typedef {object} NavSessionState
 * @property {number | null} lastX
 * @property {number | null} lastY
 * @property {number} stuckFrames
 * @property {number} pathProgressIdx
 * @property {string} topologyKey — gridNavCacheKey at last successful replan
 * @property {number | null} lastTargetX
 * @property {number | null} lastTargetY
 * @property {number} lastOffPathReplan
 * @property {number} [hpaReplanRequestId] — 0 = idle; non-zero while worker replan in flight
 * @property {number} [pathSlot] — worker path SAB slot while following a path, -1 when idle
 * @property {number} [pathLen] — cell count in pathSlot SAB
 */
/** @param {NavSessionState} navState */
export function navHasPath(navState) {
    return navState.pathLen > 0 && navState.pathSlot >= 0;
}
/** @returns {NavSessionState} */
export function createNavState() {
    return {
        lastX: null,
        lastY: null,
        stuckFrames: 0,
        pathProgressIdx: 0,
        topologyKey: "",
        lastTargetX: null,
        lastTargetY: null,
        lastOffPathReplan: 0,
        hpaReplanRequestId: 0,
        pathSlot: -1,
        pathLen: 0,
        routeId: 0,
        pendingReplanReason: null,
        lastAcceptedRouteReason: null,
        lastAcceptedPathLen: 0,
        lastAcceptedProgressIdx: 0,
        lastAcceptedTargetX: null,
        lastAcceptedTargetY: null,
    };
}
const PATH_WAYPOINT_ARRIVAL_PX = 16;
function sabWaypointArrived(bodyX, bodyY, bodyIdx, worker, slot, i, arrivalPx, grid, navTopology) {
    const idx = worker.pathIdx(slot, i);
    const wx = grid.gridCenterXByIdx(idx);
    const wy = grid.gridCenterYByIdx(idx);
    if (Math.hypot(wx - bodyX, wy - bodyY) <= arrivalPx) return true;
    if (i > 0) {
        const prevIdx = worker.pathIdx(slot, i - 1);
        const prevWx = grid.gridCenterXByIdx(prevIdx);
        const prevWy = grid.gridCenterYByIdx(prevIdx);
        const dx_seg = wx - prevWx;
        const dy_seg = wy - prevWy;
        const dx_agent = bodyX - wx;
        const dy_agent = bodyY - wy;
        const segLen = Math.hypot(dx_seg, dy_seg);
        if (segLen > 0.001) {
            const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
            if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) return true;
        }
    }
    if (bodyIdx === idx) return true;
    return grid.canStep(bodyIdx, idx, navTopology);
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function findSabPathProgressIdx(x, y, worker, slot, pathLen, grid, navTopology) {
    if (pathLen <= 0) return 0;
    const cols = grid.cols;
    const hereIdx = grid.worldCol(x) + grid.worldRow(y) * cols;
    let idx = 0;
    for (let i = 0; i < pathLen; i++) if (worker.pathIdx(slot, i) === hereIdx) idx = i + 1;
    if (idx >= pathLen) idx = pathLen - 1;
    const waypointArrival = PATH_WAYPOINT_ARRIVAL_PX;
    while (idx < pathLen - 1) {
        const cellIdx = worker.pathIdx(slot, idx);
        const wx = grid.gridCenterXByIdx(cellIdx);
        const wy = grid.gridCenterYByIdx(cellIdx);
        let arrived = Math.hypot(wx - x, wy - y) <= waypointArrival;
        if (!arrived && idx > 0) {
            const prevIdx = worker.pathIdx(slot, idx - 1);
            const prevWx = grid.gridCenterXByIdx(prevIdx);
            const prevWy = grid.gridCenterYByIdx(prevIdx);
            const dx_seg = wx - prevWx;
            const dy_seg = wy - prevWy;
            const dx_agent = x - wx;
            const dy_agent = y - wy;
            const segLen = Math.hypot(dx_seg, dy_seg);
            if (segLen > 0.001) {
                const dot = (dx_seg / segLen) * dx_agent + (dy_seg / segLen) * dy_agent;
                if (dot > 0 && Math.abs(dot) < grid.cellSize * 1.5) arrived = true;
            }
        }
        if (!arrived) break;
        if (hereIdx === cellIdx) {
            idx++;
            continue;
        }
        if (!grid.canStep(hereIdx, cellIdx, navTopology)) break;
        idx++;
    }
    return idx;
}
/**
 * @param {number} x
 * @param {number} y
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} progressIdx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function buildSabPathOverlayFromProgress(x, y, worker, slot, pathLen, progressIdx, grid) {
    if (pathLen <= 0) return { pathNodes: [] };
    const idx = Math.max(0, Math.min(progressIdx ?? 0, pathLen - 1));
    const pathNodes = [];
    for (let i = idx; i < pathLen; i++) {
        const cellIdx = worker.pathIdx(slot, i);
        pathNodes.push({ x: grid.gridCenterXByIdx(cellIdx), y: grid.gridCenterYByIdx(cellIdx) });
    }
    const first = pathNodes[0];
    if (first && Math.hypot(first.x - x, first.y - y) > 1) {
        const aCol = grid.worldCol(x);
        const aRow = grid.worldRow(y);
        const bCol = grid.worldCol(first.x);
        const bRow = grid.worldRow(first.y);
        if (Math.abs(aCol - bCol) <= 1 && Math.abs(aRow - bRow) <= 1) pathNodes.unshift({ x, y });
    }
    return { pathNodes };
}
/**
 * Debug overlay — maps abstract idx SAB + graph meta to world nodes. Only call from getPathOverlay.
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {{ pathPlanner: "local" | "hpa", abstractPath: Array<{ x: number, y: number, id?: string }> } | null}
 */
export function buildSabAbstractPathOverlay(worker, slot, pathLen) {
    if (pathLen <= 0) return null;
    const abstractLen = worker.abstractPathLen(slot);
    if (abstractLen <= 0) return { pathPlanner: "local", abstractPath: [worker.pathIdx(slot, 0), worker.pathIdx(slot, pathLen - 1)] };
    const nodeCount = worker.graphNodeCount;
    const startTemp = nodeCount;
    const targetTemp = nodeCount + 1;
    const abstractPath = [];
    for (let i = 0; i < abstractLen; i++) {
        const idx = worker.abstractPathIdx(slot, i);
        if (idx === startTemp) abstractPath.push(worker.pathIdx(slot, 0));
        else if (idx === targetTemp) abstractPath.push(worker.pathIdx(slot, pathLen - 1));
        else abstractPath.push(worker.graphNodeIdx(idx));
    }
    return { pathPlanner: "hpa", abstractPath };
}
/**
 * @param {import("../Agent/types.js").AgentPose} pose
 * @param {import("./HpaPathWorker.js").HpaPathWorker} worker
 * @param {number} slot
 * @param {number} pathLen
 * @param {number} targetX
 * @param {number} targetY
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ navCardinalOpen: Uint8Array, vertexPassability: Uint8Array, grid: import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid, wallRevision: number }} navTopology
 * @param {object} [settings]
 * @param {import("./navSession.js").NavSessionState | null} [navState]
 */
const tempWallProxies = [];
const tempCornerProxies = [];
class PathSteeringEvaluator {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 0;
        this.worker = null;
        this.slot = -1;
        this.pathLen = 0;
        this.grid = null;
        this.settings = null;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    init(pose, worker, slot, pathLen, grid, settings) {
        this.x = pose.x;
        this.y = pose.y;
        this.vx = pose.vx ?? 0;
        this.vy = pose.vy ?? 0;
        this.radius = resolveBodyRadius(pose);
        this.worker = worker;
        this.slot = slot;
        this.pathLen = pathLen;
        this.grid = grid;
        this.settings = settings;
        this.clearanceRadius = 0;
        this.centeredClearance = 0;
        this.hasNearWalls = false;
    }
    getPathX(step) {
        return this.grid.gridCenterXByIdx(this.worker.pathIdx(this.slot, step));
    }
    getPathY(step) {
        return this.grid.gridCenterYByIdx(this.worker.pathIdx(this.slot, step));
    }
    resolveClearanceRadius() {
        const bodyRadius = this.radius;
        tempWallProxies.length = 0;
        this.grid.appendStaticWallProxiesNearWorld(this.x, this.y, bodyRadius + this.grid.cellSize, tempWallProxies);
        let wallThickness = 4; // Default thickness fallback
        for (let i = 0; i < tempWallProxies.length; i++) {
            const wall = tempWallProxies[i];
            const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
            if (thickness > 0 && thickness < this.grid.cellSize) wallThickness = Math.max(wallThickness, thickness);
        }
        this.hasNearWalls = tempWallProxies.length > 0;
        tempWallProxies.length = 0; // Clear references to prevent memory leaks
        const freeHalfWidth = (this.grid.cellSize - wallThickness) * 0.5;
        const centeredClearance = freeHalfWidth - bodyRadius;
        this.centeredClearance = centeredClearance;
        const safetyPadding = Math.max(0, centeredClearance * 0.85);
        this.clearanceRadius = bodyRadius + safetyPadding;
    }
    findLookaheadStep(step) {
        const maxLookahead = this.hasNearWalls ? 1 : 4;
        let lookaheadStep = step + 1;
        let validLookaheadStep = step;
        while (lookaheadStep < step + maxLookahead && lookaheadStep < this.pathLen) {
            const lx = this.getPathX(lookaheadStep);
            const ly = this.getPathY(lookaheadStep);
            if (hasLineOfSight(this.x, this.y, lx, ly, this.grid, this.clearanceRadius)) validLookaheadStep = lookaheadStep;
            else break; // Stop looking ahead if line of sight is broken by walls/corners
            lookaheadStep++;
        }
        return validLookaheadStep;
    }
    calculateCornerSlowdown(progressStep, maxSpeed, accel, currentDesiredSpeed) {
        let desiredSpeed = currentDesiredSpeed;
        const minCornerSpeed = Math.min(30.0, maxSpeed * 0.35);
        const startCheck = Math.max(1, progressStep - 1);
        const endCheck = Math.min(this.pathLen - 2, progressStep + 3);
        for (let i = startCheck; i <= endCheck; i++) {
            const idxPrev = this.worker.pathIdx(this.slot, i - 1);
            const idxCurr = this.worker.pathIdx(this.slot, i);
            const idxNext = this.worker.pathIdx(this.slot, i + 1);
            const xPrev = this.grid.gridCenterXByIdx(idxPrev);
            const yPrev = this.grid.gridCenterYByIdx(idxPrev);
            const xCurr = this.grid.gridCenterXByIdx(idxCurr);
            const yCurr = this.grid.gridCenterYByIdx(idxCurr);
            const xNext = this.grid.gridCenterXByIdx(idxNext);
            const yNext = this.grid.gridCenterYByIdx(idxNext);
            const dx0 = xCurr - xPrev;
            const dy0 = yCurr - yPrev;
            const dx1 = xNext - xCurr;
            const dy1 = yNext - yCurr;
            const d0 = Math.hypot(dx0, dy0);
            const d1 = Math.hypot(dx1, dy1);
            if (d0 > 0.001 && d1 > 0.001) {
                const cosTheta = (dx0 * dx1 + dy0 * dy1) / (d0 * d1);
                if (cosTheta < 0.95) {
                    tempCornerProxies.length = 0;
                    this.grid.appendStaticWallProxiesNearWorld(xCurr, yCurr, this.radius + this.grid.cellSize, tempCornerProxies);
                    let cornerWallThickness = 4;
                    for (let w = 0; w < tempCornerProxies.length; w++) {
                        const wall = tempCornerProxies[w];
                        const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                        if (thickness > 0 && thickness < this.grid.cellSize) cornerWallThickness = Math.max(cornerWallThickness, thickness);
                    }
                    const hasNearWallsAtCorner = tempCornerProxies.length > 0;
                    tempCornerProxies.length = 0;
                    const cornerFreeHalfWidth = (this.grid.cellSize - cornerWallThickness) * 0.5;
                    const cornerClearance = cornerFreeHalfWidth - this.radius;
                    const maxDev = hasNearWallsAtCorner ? Math.max(0.5, cornerClearance * 0.75) : 4.0;
                    const invCos = 1.0 - Math.max(-1.0, Math.min(1.0, cosTheta));
                    const cornerSpeed = Math.max(minCornerSpeed, Math.min(maxSpeed, Math.sqrt((accel * maxDev) / invCos)));
                    const distToCorner = Math.hypot(xCurr - this.x, yCurr - this.y);
                    const brakingDistance = (maxSpeed * maxSpeed - cornerSpeed * cornerSpeed) / (2 * accel);
                    if (distToCorner < brakingDistance) {
                        const limit = Math.sqrt(cornerSpeed * cornerSpeed + 2 * accel * distToCorner);
                        desiredSpeed = Math.min(desiredSpeed, limit);
                    }
                }
            }
        }
        return desiredSpeed;
    }
    calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, currentDesiredSpeed) {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed <= 20.0 || dist < 0.01) return currentDesiredSpeed;
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        const tx = dx / dist;
        const ty = dy / dist;
        const cosAlign = dirX * tx + dirY * ty;
        if (cosAlign < 0.95) {
            tempCornerProxies.length = 0;
            this.grid.appendStaticWallProxiesNearWorld(steerX, steerY, this.radius + this.grid.cellSize, tempCornerProxies);
            let targetWallThickness = 4;
            for (let w = 0; w < tempCornerProxies.length; w++) {
                const wall = tempCornerProxies[w];
                const thickness = Math.min(wall.width !== undefined ? wall.width : wall.size, wall.height !== undefined ? wall.height : wall.size);
                if (thickness > 0 && thickness < this.grid.cellSize) targetWallThickness = Math.max(targetWallThickness, thickness);
            }
            const hasNearWallsAtTarget = tempCornerProxies.length > 0;
            tempCornerProxies.length = 0;
            const targetFreeHalfWidth = (this.grid.cellSize - targetWallThickness) * 0.5;
            const targetClearance = targetFreeHalfWidth - this.radius;
            const maxDevAlign = hasNearWallsAtTarget ? Math.max(0.5, targetClearance * 0.75) : 4.0;
            const invCosAlign = 1.0 - Math.max(-1.0, Math.min(1.0, cosAlign));
            const alignSpeed = Math.max(30.0, Math.min(maxSpeed, Math.sqrt((accel * maxDevAlign) / invCosAlign)));
            return Math.min(currentDesiredSpeed, alignSpeed);
        }
        return currentDesiredSpeed;
    }
}
const tempEvaluator = new PathSteeringEvaluator();
export function computeSabPathSteering(pose, worker, slot, pathLen, targetX, targetY, grid, navTopology, settings, navState = null) {
    const x = pose.x;
    const y = pose.y;
    const bodyIdx = grid.worldCol(x) + grid.worldRow(y) * grid.cols;
    // Initialize evaluator and resolve wall clearance first so we can use its properties
    tempEvaluator.init(pose, worker, slot, pathLen, grid, settings);
    tempEvaluator.resolveClearanceRadius();
    let waypointArrival = settings.pathWaypointArrival;
    if (tempEvaluator.hasNearWalls) waypointArrival = Math.min(waypointArrival, Math.max(3.0, tempEvaluator.radius + 1.0));
    const arrivalDistance = settings.arrivalDistance;
    const offPathDistance = settings.pathOffPathDistance;
    let step = navState?.pathProgressIdx ?? 0;
    if (step >= pathLen) step = pathLen - 1;
    let steerIdx = worker.pathIdx(slot, step);
    let steerX = grid.gridCenterXByIdx(steerIdx);
    let steerY = grid.gridCenterYByIdx(steerIdx);
    let dx = steerX - x;
    let dy = steerY - y;
    let dist = Math.hypot(dx, dy);
    while (dist < waypointArrival && step < pathLen - 1 && sabWaypointArrived(x, y, bodyIdx, worker, slot, step, waypointArrival, grid, navTopology)) {
        step++;
        if (navState) navState.pathProgressIdx = step;
        steerIdx = worker.pathIdx(slot, step);
        steerX = grid.gridCenterXByIdx(steerIdx);
        steerY = grid.gridCenterYByIdx(steerIdx);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const progressStep = step;
    const validLookaheadStep = tempEvaluator.findLookaheadStep(step);
    if (validLookaheadStep > step) {
        step = validLookaheadStep;
        if (navState) navState.pathProgressIdx = step;
        steerX = tempEvaluator.getPathX(step);
        steerY = tempEvaluator.getPathY(step);
        dx = steerX - x;
        dy = steerY - y;
        dist = Math.hypot(dx, dy);
    }
    const distToTarget = Math.hypot(targetX - x, targetY - y);
    if (step >= pathLen - 1 && distToTarget <= arrivalDistance) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    if (!(dist >= 0.01)) return { desiredX: 0, desiredY: 0, desiredSpeed: 0, offPath: false };
    const maxSpeed = settings.maxSpeed ?? 180;
    const accel = settings.accel ?? 600;
    let desiredSpeed = maxSpeed;
    desiredSpeed = tempEvaluator.calculateCornerSlowdown(progressStep, maxSpeed, accel, desiredSpeed);
    desiredSpeed = tempEvaluator.calculateAlignmentSlowdown(steerX, steerY, dx, dy, dist, maxSpeed, accel, desiredSpeed);
    const decelRadius = Math.max(32.0, (maxSpeed * maxSpeed) / (2.0 * accel));
    if (step >= pathLen - 1 || distToTarget < decelRadius) {
        const arrivalFactor = Math.max(0.15, Math.min(1.0, distToTarget / decelRadius));
        desiredSpeed = Math.min(desiredSpeed, maxSpeed * arrivalFactor);
    }
    return { desiredX: dx / dist, desiredY: dy / dist, desiredSpeed, offPath: dist > offPathDistance };
}
export class HpaNavSession {
    constructor() {
        this.navState = createNavState();
        this.replanClockMs = 0;
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
    }
    reset(state) {
        this.pendingTargetReplan = false;
        this.committedPathSlot = -1;
        this.committedPathLen = 0;
        this.routeCommitFrames = 0;
        const nav = resolveNavRuntime(state);
        nav.worker.releaseOwnedPathSlot(this.navState);
        Object.assign(this.navState, createNavState());
        this.replanClockMs = 0;
    }
    markTargetChanged() {
        this.pendingTargetReplan = true;
    }
    isRoutePending() {
        return this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
    }
    replan(prop, targetX, targetY, state, priority = REPLAN_PRIORITY_TARGET) {
        const nav = resolveNavRuntime(state);
        return nav.session.requestReplan(this.navState, buildReplanParams(state.obstacleGrid, prop.x, prop.y, targetX, targetY, nav, prop.navStepPenalty, state), priority);
    }
    requestReplan(prop, targetX, targetY, state, priority, reason) {
        const accepted = this.replan(prop, targetX, targetY, state, priority);
        if (accepted) {
            this.pendingTargetReplan = false;
            this.navState.pendingReplanReason = reason;
            this.navState.stuckFrames = 0;
            return { steering: null, replanReason: reason };
        }
        return { steering: null, replanReason: "cooldown" };
    }
    syncRouteCommitState() {
        if (!navHasPath(this.navState)) {
            this.committedPathSlot = -1;
            this.committedPathLen = 0;
            this.routeCommitFrames = 0;
            return;
        }
        if (this.navState.pathSlot !== this.committedPathSlot || this.navState.pathLen !== this.committedPathLen) {
            this.committedPathSlot = this.navState.pathSlot;
            this.committedPathLen = this.navState.pathLen;
            this.routeCommitFrames = 0;
            return;
        }
        this.routeCommitFrames++;
    }
    softReplanAllowed(stuckFrames, stuckReplanFrames) {
        return stuckFrames > Math.max(1, Math.floor(stuckReplanFrames * 0.5));
    }
    update(prop, targetX, targetY, state, dtMs, pathSettings) {
        this.replanClockMs += dtMs;
        const nav = resolveNavRuntime(state);
        const settings = nav.settings;
        const inFlight = nav.session.isReplanInFlight(this.navState);
        const routePending = this.pendingTargetReplan || this.navState.hpaReplanRequestId !== 0;
        if (inFlight || routePending) {
            this.navState.stuckFrames = 0;
            this.navState.lastX = prop.x;
            this.navState.lastY = prop.y;
        } else trackNavStuck(this.navState, prop.x, prop.y, settings.stuckMoveThreshold);
        const isVisible = state.viewport.circleInBounds(prop.x, prop.y, prop.radius, "props");
        const stuckFrames = this.navState.stuckFrames;
        const stuckReplanFrames = settings.stuckReplanFrames;
        this.syncRouteCommitState();
        if (!inFlight && obstacleEpochReplanDue(this.navState, nav.topologyKey()))
            if (obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor("epoch", isVisible), "epoch");
        let sandboxReason = sandboxReplanReason(this.navState, this.pendingTargetReplan, inFlight, targetX, targetY);
        if (sandboxReason === "targetMoved" && !this.softReplanAllowed(stuckFrames, stuckReplanFrames)) sandboxReason = null;
        if (sandboxReason && sandboxReplanAllowed(sandboxReason, isVisible, stuckFrames, stuckReplanFrames))
            return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor(sandboxReason, isVisible), sandboxReason);
        const idleReason = idlePathReplanReason(this.navState, settings, inFlight);
        if (idleReason && idlePathReplanAllowed(this.navState, idleReason, isVisible, stuckReplanFrames))
            return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor(idleReason, isVisible), idleReason);
        if (!navHasPath(this.navState)) return { steering: null, replanReason: routePending ? "pending" : "noPath" };
        const steering = computeSabPathSteering(
            agentPose(prop),
            nav.worker,
            this.navState.pathSlot,
            this.navState.pathLen,
            targetX,
            targetY,
            state.obstacleGrid,
            nav.topology,
            pathSettings,
            this.navState,
        );
        if (steering && !inFlight && offPathReplanDue(steering, this.navState, this.replanClockMs))
            if (this.softReplanAllowed(stuckFrames, stuckReplanFrames) && obstacleReplanAllowed(isVisible, stuckFrames, stuckReplanFrames)) {
                this.navState.lastOffPathReplan = this.replanClockMs;
                return this.requestReplan(prop, targetX, targetY, state, replanPriorityFor("offPath", isVisible), "offPath");
            }
        return { steering, replanReason: null };
    }
    getCommitStatus() {
        return { routeCommitFrames: this.routeCommitFrames };
    }
}
// --- MERGED FROM GridNavSnapshot.js ---
/** @typedef {{ minX: number, minY: number, cellSize: number, cols: number, rows: number, key: string }} GridFrame */
/** Stable id for obstacle-grid frame — resize or origin shift changes this. */
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
/** @param {{ minX: number, minY: number, cellSize: number, cols: number, rows: number }} grid */
export function gridFrameFromGrid(grid) {
    return { minX: grid.minX, minY: grid.minY, cellSize: grid.cellSize, cols: grid.cols, rows: grid.rows, key: gridNavFrameKey(grid) };
}
export function snapshotWorldCol(frame, x) {
    return worldColAtOrigin(x, frame.minX, frame.cellSize);
}
export function snapshotWorldRow(frame, y) {
    return worldRowAtOrigin(y, frame.minY, frame.cellSize);
}
export function snapshotGridCenterX(frame, col) {
    return gridCenterXAtOrigin(col, frame.minX, frame.cellSize * 0.5);
}
export function snapshotGridCenterY(frame, row) {
    return gridCenterYAtOrigin(row, frame.minY, frame.cellSize * 0.5);
}
export function snapshotWorldToGrid(frame, x, y) {
    return { col: snapshotWorldCol(frame, x), row: snapshotWorldRow(frame, y) };
}
export function snapshotGridToWorld(frame, col, row) {
    return { x: snapshotGridCenterX(frame, col), y: snapshotGridCenterY(frame, row) };
}
// --- MERGED FROM neighborGridLayout.js ---
export const OCTILE_NEIGHBOR_GRID_LAYOUT = Object.freeze({
    directionCount: OCTILE_DIRS_PER_CELL,
    bytesPerCell: OCTILE_NEIGHBOR_BYTES,
    bufferByteLength(cellCount) {
        return cellCount * this.bytesPerCell;
    },
    cellBase(cellIdx) {
        return octileNeighborBase(cellIdx);
    },
    cellOffset(cellIdx, dirIdx) {
        return octileNeighborOffset(cellIdx, dirIdx);
    },
    clearCell(neighborGrid, cellIdx) {
        const base = this.cellBase(cellIdx);
        for (let dir = 0; dir < this.directionCount; dir++) neighborGrid[base + dir] = -1;
    },
});
// --- MERGED FROM gridBfs.js ---
export function bfsIndices(seeds, visit) {
    const queue = Array.isArray(seeds) ? seeds : [seeds];
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        visit(idx, (nIdx) => {
            queue.push(nIdx);
        });
    }
    return queue;
}
export function bfsColRowQueue(queue, visit) {
    let head = 0;
    while (head < queue.length) {
        const col = queue[head++];
        const row = queue[head++];
        visit(col, row, (nc, nr) => {
            queue.push(nc, nr);
        });
    }
    return queue;
}
export function bfsTypedIndices(startIdx, gridSize, visit) {
    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;
    while (head < tail) {
        const idx = queue[head++];
        const result = visit(idx, visited, (nIdx) => {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
        });
        if (result !== undefined) return result;
    }
}
