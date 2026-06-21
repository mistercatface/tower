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
        return { ...endpoints, stepPenaltyKeys: this.stepPenalty?.keys ?? null, stepPenaltyCosts: this.stepPenalty?.costs ?? null };
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
    const startGrid = grid.worldToGrid(startX, startY);
    const targetGrid = grid.worldToGrid(targetX, targetY);
    let startCol = Math.max(0, Math.min(grid.cols - 1, startGrid.col));
    let startRow = Math.max(0, Math.min(grid.rows - 1, startGrid.row));
    let targetCol = Math.max(0, Math.min(grid.cols - 1, targetGrid.col));
    let targetRow = Math.max(0, Math.min(grid.rows - 1, targetGrid.row));
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
/**
 * @param {number} cols
 * @param {Int16Array} cellToRegion
 * @param {{ nodeCount: number, nodeIds: string[], nodeCol: Int16Array | ArrayLike<number>, nodeRow: Int16Array | ArrayLike<number> }} graphMeta
 * @param {number} startCol
 * @param {number} startRow
 * @param {number} targetCol
 * @param {number} targetRow
 */
export function prepareHpaReplanPrep(cols, cellToRegion, graphMeta, startCol, startRow, targetCol, targetRow) {
    const startIdx = colRowToIndex(startCol, startRow, cols);
    const targetIdx = colRowToIndex(targetCol, targetRow, cols);
    const startRegion = cellToRegion[startIdx];
    const targetRegion = cellToRegion[targetIdx];
    const cellDist = Math.hypot(startCol - targetCol, startRow - targetRow);
    if (cellDist < HPA_LOCAL_DISTANCE_THRESHOLD || (startRegion >= 0 && startRegion === targetRegion)) return { mode: "local", startCol, startRow, targetCol, targetRow };
    const { nodeIds, nodeCol, nodeRow } = graphMeta;
    return { mode: "hpa", startCol, startRow, targetCol, targetRow, nodeCount: graphMeta.nodeCount, nodeIds, nodeCol, nodeRow, regionConnectMaxLen: HPA_REGION_CONNECT_MAX_LEN };
}
