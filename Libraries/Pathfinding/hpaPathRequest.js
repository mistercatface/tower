import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { snapNavGoalCell } from "../Navigation/snapNavGoal.js";
import { findSabPathProgressIdx } from "./hpaPathSlot.js";
export const HPA_LOCAL_MAX_LEN = 96;
export const HPA_REGION_CONNECT_MAX_LEN = 96;
export const HPA_LOCAL_DISTANCE_THRESHOLD = 32;
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
    resolveEndpoints() {
        return resolveSnappedPathEndpoints(this.obstacleGrid, this.startX, this.startY, this.targetX, this.targetY);
    }
    toWorkerPayload() {
        const endpoints = this.resolveEndpoints();
        return {
            query: { start: { col: endpoints.startCol, row: endpoints.startRow }, target: { col: endpoints.targetCol, row: endpoints.targetRow } },
            stepPenaltyKeys: this.stepPenalty?.keys ?? null,
            stepPenaltyCosts: this.stepPenalty?.costs ?? null,
        };
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
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function findNearestOpenCell(grid, col, row) {
    return findNearestOpenCellCore(grid.cols, grid.rows, col, row, (c, r) => !grid.isBlocked(c, r));
}
/** @param {Uint8Array} blocked */
export function findNearestOpenCellBlocked(blocked, cols, rows, col, row) {
    return findNearestOpenCellCore(cols, rows, col, row, (c, r) => !blocked[colRowToIndex(c, r, cols)]);
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} startX
 * @param {number} startY
 * @param {number} targetX
 * @param {number} targetY
 */
export function resolveSnappedPathEndpoints(grid, startX, startY, targetX, targetY) {
    let startCol = Math.max(0, Math.min(grid.cols - 1, grid.worldCol(startX)));
    let startRow = Math.max(0, Math.min(grid.rows - 1, grid.worldRow(startY)));
    let targetCol = Math.max(0, Math.min(grid.cols - 1, grid.worldCol(targetX)));
    let targetRow = Math.max(0, Math.min(grid.rows - 1, grid.worldRow(targetY)));
    const startOpen = findNearestOpenCell(grid, startCol, startRow);
    startCol = startOpen.col;
    startRow = startOpen.row;
    const targetOpen = findNearestOpenCell(grid, targetCol, targetRow);
    targetCol = targetOpen.col;
    targetRow = targetOpen.row;
    const snapped = snapNavGoalCell(grid, startCol, startRow, targetCol, targetRow);
    targetCol = snapped.col;
    targetRow = snapped.row;
    return { startCol, startRow, targetCol, targetRow };
}
export function prepareHpaReplanPrep(cols, cellToRegion, graphMeta, sc, sr, tc, tr) {
    const startIdx = colRowToIndex(sc, sr, cols);
    const targetIdx = colRowToIndex(tc, tr, cols);
    const startRegion = cellToRegion[startIdx];
    const targetRegion = cellToRegion[targetIdx];
    const cellDist = Math.hypot(sc - tc, sr - tr);
    if (cellDist < HPA_LOCAL_DISTANCE_THRESHOLD || (startRegion >= 0 && startRegion === targetRegion)) return { mode: "local", sc, sr, tc, tr };
    const { nodeIds, nodeCol, nodeRow } = graphMeta;
    return { mode: "hpa", sc, sr, tc, tr, nodeCount: graphMeta.nodeCount, nodeIds, nodeCol, nodeRow, regionConnectMaxLen: HPA_REGION_CONNECT_MAX_LEN, startRegion, targetRegion };
}
