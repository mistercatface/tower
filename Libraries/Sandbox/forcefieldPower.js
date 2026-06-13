import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { isForcefieldEdge } from "../Spatial/grid/CellEdge.js";
import { gridCellToGlobalColRow } from "../World/wallGridCells.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive } from "./buttonInput.js";
import { gridHasForcefield } from "./gridWallEdit.js";
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
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {number} side */
export function isForcefieldPoweredAtGlobal(state, globalCol, globalRow, side) {
    return state.sandbox.forcefieldPowered.get(packEdgeCellKey(globalCol, globalRow, side)) === true;
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
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {number} side @param {boolean} powered */
export function setForcefieldPoweredAtGlobal(state, globalCol, globalRow, side, powered) {
    const grid = state.obstacleGrid;
    const half = grid.cellSize * 0.5;
    const { col, row } = grid.worldToGrid(globalCol * grid.cellSize + half, globalRow * grid.cellSize + half);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return setForcefieldPowered(state, col, row, side, powered, { notify: false });
}
/** @param {object} state */
export function clearAllForcefieldPower(state) {
    state.sandbox.forcefieldPowered.clear();
}
/** @param {object} state */
export function syncForcefieldButtonPower(state) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    /** @type {Map<number, boolean>} */
    const linkedPower = new Map();
    forEachButtonEntity(state, (button) => {
        const signal = buttonEffectiveActive(state, button);
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "gridEdge") continue;
            const key = packEdgeCellKey(link.globalCol, link.globalRow, link.side);
            linkedPower.set(key, (linkedPower.get(key) ?? false) || signal);
        }
    });
    if (!linkedPower.size) return;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            if (!gridHasForcefield(grid, col, row, side)) continue;
            const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
            const key = packEdgeCellKey(globalCol, globalRow, side);
            if (!linkedPower.has(key)) continue;
            const powered = linkedPower.get(key) === true;
            const wasPowered = state.sandbox.forcefieldPowered.get(key) === true;
            if (powered === wasPowered) continue;
            if (powered) state.sandbox.forcefieldPowered.set(key, true);
            else state.sandbox.forcefieldPowered.delete(key);
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
        }
    }
    if (minCol === Infinity) return;
    state.navigation.onObstaclesChanged({ startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });
}
