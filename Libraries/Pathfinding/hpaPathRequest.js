import { colRowToIndex, octileDistanceIdx } from "../Spatial/grid/GridUtils.js";
import { snapNavGoalCellIndex } from "../Navigation/snapNavGoal.js";
import { findSabPathProgressIdx } from "./hpaPathSlot.js";
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
