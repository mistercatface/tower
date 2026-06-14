import { isForcefieldEdge } from "../Spatial/grid/CellEdge.js";
import { isPassagePowered, setPassagePowered } from "../Spatial/grid/boundaryOccupancy.js";
import { gridWallEdgeNeighbor } from "../World/wallGridCells.js";
import { gridHasForcefield } from "./gridWallEdit.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function isForcefieldPowered(state, grid, col, row, side) {
    return isPassagePowered(grid, col, row, side);
}
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {number} side */
export function isForcefieldPoweredAtGlobal(state, globalCol, globalRow, side) {
    const grid = state.obstacleGrid;
    const half = grid.cellSize * 0.5;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return isPassagePowered(grid, col, row, side);
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {{ notify?: boolean }} [options] */
function notifyPassageChange(state, col, row, side, { notify = true } = {}) {
    if (!notify) return;
    let startCol = col;
    let endCol = col;
    let startRow = row;
    let endRow = row;
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    if (nc >= 0 && nc < state.obstacleGrid.cols && nr >= 0 && nr < state.obstacleGrid.rows) {
        startCol = Math.min(startCol, nc);
        endCol = Math.max(endCol, nc);
        startRow = Math.min(startRow, nr);
        endRow = Math.max(endRow, nr);
    }
    state.navigation.onObstaclesChanged({ startCol, endCol, startRow, endRow });
}
/**
 * @param {object} state
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {boolean} powered
 * @param {{ notify?: boolean }} [options]
 */
export function setForcefieldPowered(state, col, row, side, powered, { notify = true } = {}) {
    const grid = state.obstacleGrid;
    const edge = grid.getCellEdge(col, row, side);
    if (!isForcefieldEdge(edge)) return false;
    setPassagePowered(grid, col, row, side, powered);
    notifyPassageChange(state, col, row, side, { notify });
    return true;
}
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {number} side @param {boolean} powered */
export function setForcefieldPoweredAtGlobal(state, globalCol, globalRow, side, powered) {
    const grid = state.obstacleGrid;
    const half = grid.cellSize * 0.5;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return setForcefieldPowered(state, col, row, side, powered, { notify: false });
}
/** @param {object} state */
export function syncForcefieldButtonPower(state) {
    syncPassagePowerNetwork(state);
}
