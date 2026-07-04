import { navHasPath } from "./navSession.js";
export const REPLAN_TARGET_MOVE_PX = 64;
export const REPLAN_OFF_PATH_COOLDOWN_MS = 250;
export const REPLAN_PRIORITY_TARGET = 4;
export const REPLAN_PRIORITY_VISIBLE = 3;
export const REPLAN_PRIORITY_NORMAL = 2;
export const REPLAN_PRIORITY_STUCK_OFFSCREEN = 1;
export const HPA_REPLAN_FRAME_START_BUDGET = 12;
export const HPA_REPLAN_PEAK_INFLIGHT_CAP = 16;
export function buildReplanParams(obstacleGrid, startX, startY, targetX, targetY, nav, stepPenalty) {
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
import { FlatGraphView } from "./AStar.js";
import { octileDistanceIdx, colRowToIndex } from "../Spatial/grid/GridUtils.js";
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
        const extendedGraph = new HpaAbstractGraph(extNodeIdx, cols, extEdgeOffsets, extEdgeTargets, extEdgeCosts, extCount, totalEdges, this.nodeIds);
        return { extendedGraph, startTemp, targetTemp };
    }
}
import { snapNavGoalCellIndex } from "../Navigation/navGraph.js";
import { findSabPathProgressIdx } from "./navSession.js";
export const HPA_LOCAL_MAX_LEN = 96;
export const HPA_REGION_CONNECT_MAX_LEN = 96;
export const HPA_LOCAL_DISTANCE_THRESHOLD = 32;
const globalReplanPayload = { startIdx: 0, targetIdx: 0, stepPenaltyKeys: null, stepPenaltyCosts: null };
export class HpaReplanRequest {
    constructor({ obstacleGrid, startX, startY, targetX, targetY, graphEpoch, topologyKey, navTopology, stepPenalty = null }) {
        this.obstacleGrid = obstacleGrid;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.graphEpoch = graphEpoch;
        this.topologyKey = topologyKey;
        this.navTopology = navTopology;
        this.stepPenalty = stepPenalty;
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
        if (!result.pathLen) {
            worker.releaseOwnedPathSlot(navState);
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
