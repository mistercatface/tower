/**
 * Sparse health + damage handling for static obstacle-grid cells (stamped caverns).
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { getDamageAlphaFromHealth } from "../Render/Structure3D/wallDamageVisual.js";
import { cellIsStaticBlocked, gridCellToGlobalColRow, patchStaticOccupancyCell } from "./staticOccupancyLayers.js";

export const STATIC_CELL_MAX_HEALTH = 30;

/** @param {object} state @param {number} globalCol @param {number} globalRow */
function readStaticCellHealth(state, globalCol, globalRow) {
    const entry = state.staticCellHealth.get(`${globalCol},${globalRow}`);
    if (!entry) return { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
    return entry;
}

/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} state
 * @param {number} col
 * @param {number} row
 */
export function getStaticCellDamageAlphaAtGrid(grid, state, col, row) {
    if (!grid?.cols || !cellIsStaticBlocked(grid, col, row)) return 0;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    const { health, maxHealth } = readStaticCellHealth(state, globalCol, globalRow);
    return getDamageAlphaFromHealth(health, maxHealth);
}

/**
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} damage
 */
export function damageStaticGridCell(state, grid, col, row, damage) {
    if (!grid?.cols || col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return;
    if (!cellIsStaticBlocked(grid, col, row)) return;
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.segmentGrid?.[idx]?.length) return;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    const key = `${globalCol},${globalRow}`;
    let entry = state.staticCellHealth.get(key);
    if (!entry) {
        entry = { health: STATIC_CELL_MAX_HEALTH, maxHealth: STATIC_CELL_MAX_HEALTH };
        state.staticCellHealth.set(key, entry);
    }
    entry.health -= damage;
    if (entry.health > 0) return;
    state.staticCellHealth.delete(key);
    grid.grid[idx] = 0;
    patchStaticOccupancyCell(state, globalCol, globalRow, 0);
    const bounds = { startCol: col, endCol: col, startRow: row, endRow: row };
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
}
