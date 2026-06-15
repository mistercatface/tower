/**
 * Sparse health + damage handling for static obstacle-grid cells and railWall edges.
 */
import { packCellKey, packEdgeCellKey } from "../DataStructures/CellKey.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { getDamageAlphaFromHealth } from "../Render/Structure3D/wallDamageVisual.js";
import { cellIsStaticWallAtIdx, cellToGlobalColRow, railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
export const STATIC_CELL_MAX_HEALTH = 30;
function readStaticCellHealth(state, globalCol, globalRow) {
    const entry = state.staticCellHealth.get(packCellKey(globalCol, globalRow));
    if (entry) return entry;
    return { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
}
function readStaticEdgeHealth(state, globalCol, globalRow, side) {
    const entry = state.staticCellHealth.get(packEdgeCellKey(globalCol, globalRow, side));
    if (entry) return entry;
    return { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
}
export function getStaticCellDamageAlphaAtIdx(grid, state, col, row, idx) {
    if (!cellIsStaticWallAtIdx(grid, idx)) return 0;
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    const { health, maxHealth } = readStaticCellHealth(state, globalCol, globalRow);
    return getDamageAlphaFromHealth(health, maxHealth);
}
export function getStaticEdgeDamageAlphaAt(grid, state, col, row, side) {
    if (!railWallEdgeAt(grid, col, row, side)) return 0;
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    const { health, maxHealth } = readStaticEdgeHealth(state, globalCol, globalRow, side);
    return getDamageAlphaFromHealth(health, maxHealth);
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} state
 * @param {number} col
 * @param {number} row
 */
export function getStaticCellDamageAlphaAtGrid(grid, state, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return 0;
    return getStaticCellDamageAlphaAtIdx(grid, state, col, row, colRowToIndex(col, row, grid.cols));
}
/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} damage
 */
export function damageStaticGridCell(state, grid, col, row, damage) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!cellIsStaticWallAtIdx(grid, idx)) return;
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    const key = packCellKey(globalCol, globalRow);
    let entry = state.staticCellHealth.get(key);
    if (!entry) {
        entry = { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
        state.staticCellHealth.set(key, entry);
    }
    entry.health -= damage;
    if (entry.health > 0) return;
    state.staticCellHealth.delete(key);
    grid.grid[idx] = 0;
    grid.bumpWallGridRevision();
    const bounds = { startCol: col, endCol: col, startRow: row, endRow: row };
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
}
/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {number} damage
 */
export function damageStaticGridEdge(state, grid, col, row, side, damage) {
    if (!railWallEdgeAt(grid, col, row, side)) return;
    const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
    const key = packEdgeCellKey(globalCol, globalRow, side);
    let entry = state.staticCellHealth.get(key);
    if (!entry) {
        entry = { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
        state.staticCellHealth.set(key, entry);
    }
    entry.health -= damage;
    if (entry.health > 0) return;
    state.staticCellHealth.delete(key);
    grid.clearCellEdge(col, row, side);
    const bounds = { startCol: col, endCol: col, startRow: row, endRow: row };
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
}
