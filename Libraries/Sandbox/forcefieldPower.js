import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { isForcefieldEdge } from "../Spatial/grid/CellEdge.js";
import { gridCellToGlobalColRow } from "../World/wallGridCells.js";
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function forcefieldEdgeKey(grid, col, row, side) {
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    return packEdgeCellKey(globalCol, globalRow, side);
}
/** @param {object} state */
export function bindForcefieldStepBlocking(state) {
    state.obstacleGrid.isForcefieldStepBlocked = (col, row, side) => isForcefieldPowered(state, state.obstacleGrid, col, row, side);
}
/** @param {object} state */
export function unbindForcefieldStepBlocking(state) {
    state.obstacleGrid.isForcefieldStepBlocked = null;
}
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function isForcefieldPowered(state, grid, col, row, side) {
    return state.sandbox.forcefieldPowered.get(forcefieldEdgeKey(grid, col, row, side)) === true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {{ notify?: boolean }} [options] */
function notifyForcefieldPowerChange(state, col, row, { notify = true } = {}) {
    if (!notify) return;
    state.navigation.onObstaclesChanged({ startCol: col, endCol: col, startRow: row, endRow: row });
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {{ notify?: boolean }} [options] */
export function clearForcefieldPowerAt(state, col, row, side, { notify = false } = {}) {
    state.sandbox.forcefieldPowered.delete(forcefieldEdgeKey(state.obstacleGrid, col, row, side));
    notifyForcefieldPowerChange(state, col, row, { notify });
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
    const key = forcefieldEdgeKey(grid, col, row, side);
    if (powered) state.sandbox.forcefieldPowered.set(key, true);
    else state.sandbox.forcefieldPowered.delete(key);
    notifyForcefieldPowerChange(state, col, row, { notify });
    return true;
}
/** @param {object} state */
export function clearAllForcefieldPower(state) {
    state.sandbox.forcefieldPowered.clear();
}
