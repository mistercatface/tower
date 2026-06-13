import { isForcefieldEdge } from "../Spatial/grid/CellEdge.js";
import { isPassagePowered, setPassagePowered } from "../Spatial/grid/boundaryOccupancy.js";
import { canonicalEdgeCellKey, gridWallEdgeNeighbor } from "../World/wallGridCells.js";
import { forEachButtonEntity, getButtonLinks } from "./buttonLinks.js";
import { buttonEffectiveActive } from "./buttonInput.js";
import { gridHasForcefield } from "./gridWallEdit.js";
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
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const half = grid.cellSize * 0.5;
    /** @type {Map<number, boolean>} */
    const linkedPower = new Map();
    forEachButtonEntity(state, (button) => {
        const signal = buttonEffectiveActive(state, button);
        const links = getButtonLinks(button);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            if (link.type !== "gridEdge") continue;
            const { col, row } = grid.worldToGrid(link.globalCol * grid.cellSize + half, link.globalRow * grid.cellSize + half);
            const key = canonicalEdgeCellKey(grid, col, row, link.side);
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
            const key = canonicalEdgeCellKey(grid, col, row, side);
            if (!linkedPower.has(key)) continue;
            const powered = linkedPower.get(key) === true;
            if (isPassagePowered(grid, col, row, side) === powered) continue;
            setPassagePowered(grid, col, row, side, powered);
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
            const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
            if (nc >= 0 && nc < grid.cols && nr >= 0 && nr < grid.rows) {
                if (nc < minCol) minCol = nc;
                if (nc > maxCol) maxCol = nc;
                if (nr < minRow) minRow = nr;
                if (nr > maxRow) maxRow = nr;
            }
        }
    }
    if (minCol === Infinity) return;
    state.navigation.onObstaclesChanged({ startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });
}
