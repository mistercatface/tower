import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
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
        if (grid.isBlocked(startCol, startRow)) {
            let found = false;
            for (let r = 1; r <= 5 && !found; r++)
                for (let dr = -r; dr <= r && !found; dr++)
                    for (let dc = -r; dc <= r && !found; dc++) {
                        const nc = startCol + dc;
                        const nr = startRow + dr;
                        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !grid.isBlocked(nc, nr)) {
                            startIdx = nc + nr * cols;
                            found = true;
                        }
                    }
        }
        let targetIdx = targetCol + targetRow * cols;
        if (grid.isBlocked(targetCol, targetRow)) {
            let found = false;
            for (let r = 1; r <= 5 && !found; r++)
                for (let dr = -r; dr <= r && !found; dr++)
                    for (let dc = -r; dc <= r && !found; dc++) {
                        const nc = targetCol + dc;
                        const nr = targetRow + dr;
                        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !grid.isBlocked(nc, nr)) {
                            targetIdx = nc + nr * cols;
                            found = true;
                        }
                    }
        }
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
    const sc = startIdx % cols;
    const sr = (startIdx / cols) | 0;
    const tc = targetIdx % cols;
    const tr = (targetIdx / cols) | 0;
    const cellDist = Math.hypot(sc - tc, sr - tr);
    if (cellDist < HPA_LOCAL_DISTANCE_THRESHOLD || (startRegion >= 0 && startRegion === targetRegion)) return { mode: "local", startIdx, targetIdx };
    const { nodeIds, nodeCol, nodeRow } = graphMeta;
    return { mode: "hpa", startIdx, targetIdx, nodeCount: graphMeta.nodeCount, nodeIds, nodeCol, nodeRow, regionConnectMaxLen: HPA_REGION_CONNECT_MAX_LEN, startRegion, targetRegion };
}
function findNearestOpenCellCore(cols, rows, col, row, isOpen) {
    if (isOpen(col, row)) return { col, row };
    for (let r = 1; r <= 5; r++)
        for (let dr = -r; dr <= r; dr++)
            for (let dc = -r; dc <= r; dc++) {
                const nc = col + dc;
                const nr = row + dr;
                if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && isOpen(nc, nr)) return { col: nc, row: nr };
            }
    return { col, row };
}
export function findNearestOpenCell(grid, col, row) {
    return findNearestOpenCellCore(grid.cols, grid.rows, col, row, (c, r) => !grid.isBlocked(c, r));
}
export function findNearestOpenCellBlocked(blocked, cols, rows, col, row) {
    return findNearestOpenCellCore(cols, rows, col, row, (c, r) => !blocked[colRowToIndex(c, r, cols)]);
}
