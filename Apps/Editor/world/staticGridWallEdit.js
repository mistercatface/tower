/**
 * Region static wall edits for the tile lab — same update chain as cavern stamps.
 */
import { gridSettings } from "../../../Config/Config.js";
import { rebuildLabMapCaches } from "../../../Libraries/Render/map/labMapCaches.js";
import { colRowToIndex } from "../../../Libraries/Spatial/grid/GridUtils.js";
import { clearSandboxWallsInBounds } from "../../../Libraries/Sandbox/spawnAssembly.js";
import { resolveStampWallHeight } from "../../../Libraries/WorldSurface/stampWallHeight.js";
import { appendStaticOccupancyLayer, cellIsStaticBlocked, patchStaticOccupancyCell } from "../../../Libraries/World/staticOccupancyLayers.js";
import { forEachGlobalCellInBounds, getCellBoundsAabb } from "./cellBoundsConfig.js";
import { ensureLabObstacleGridCoverage } from "./mapWorld.js";
/** @param {import("../../../Libraries/Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} globalCol @param {number} globalRow */
function globalCellToLocal(grid, globalCol, globalRow) {
    const cellSize = grid.cellSize;
    const worldX = globalCol * cellSize + cellSize * 0.5;
    const worldY = globalRow * cellSize + cellSize * 0.5;
    const col = Math.floor((worldX - grid.minX) / cellSize);
    const row = Math.floor((worldY - grid.minY) / cellSize);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return { col, row };
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig */
function prepareWallRegion(state, boundsConfig) {
    const regionAabb = getCellBoundsAabb(boundsConfig, gridSettings.cellSize);
    ensureLabObstacleGridCoverage(state, regionAabb);
    clearSandboxWallsInBounds(state, regionAabb);
}
/** @param {import("../state.js").TileLabGameState} state @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} damageBounds @param {boolean} occupancyChanged */
function notifyWallRegionChange(state, damageBounds, occupancyChanged) {
    state.worldSurfaces.invalidateGridBounds(damageBounds, state);
    if (occupancyChanged) state.navigation.onObstaclesChanged(damageBounds);
    rebuildLabMapCaches(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig @param {number} heightLevel */
export function stampStaticWallsInBounds(state, boundsConfig, heightLevel) {
    prepareWallRegion(state, boundsConfig);
    const grid = state.obstacleGrid;
    const wallHeight = resolveStampWallHeight(heightLevel, gridSettings.cellSize);
    let minGc = Infinity;
    let minGr = Infinity;
    let maxGc = -Infinity;
    let maxGr = -Infinity;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let anyNew = false;
    /** @type {{ globalCol: number, globalRow: number, col: number, row: number }[]} */
    const cells = [];
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local) return;
        cells.push({ globalCol, globalRow, col: local.col, row: local.row });
        if (globalCol < minGc) minGc = globalCol;
        if (globalRow < minGr) minGr = globalRow;
        if (globalCol > maxGc) maxGc = globalCol;
        if (globalRow > maxGr) maxGr = globalRow;
        if (!cellIsStaticBlocked(grid, local.col, local.row)) anyNew = true;
    });
    if (!cells.length) return false;
    const stampCols = maxGc - minGc + 1;
    const stampRows = maxGr - minGr + 1;
    const bitmap = new Uint8Array(stampCols * stampRows);
    for (let i = 0; i < cells.length; i++) {
        const { globalCol, globalRow, col, row } = cells[i];
        bitmap[(globalRow - minGr) * stampCols + (globalCol - minGc)] = 1;
        if (col < startCol) startCol = col;
        if (col > endCol) endCol = col;
        if (row < startRow) startRow = row;
        if (row > endRow) endRow = row;
    }
    grid.stampStaticOccupancy(minGc, minGr, stampCols, stampRows, bitmap, state.wallSpatialIndex, { additive: true });
    appendStaticOccupancyLayer(state, { originCol: minGc, originRow: minGr, cols: stampCols, rows: stampRows, wallHeight, cells: bitmap.slice() });
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, anyNew);
    return true;
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig */
export function deleteStaticWallsInBounds(state, boundsConfig) {
    ensureLabObstacleGridCoverage(state, getCellBoundsAabb(boundsConfig, gridSettings.cellSize));
    const grid = state.obstacleGrid;
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let anyRemoved = false;
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local || !cellIsStaticBlocked(grid, local.col, local.row)) return;
        const idx = colRowToIndex(local.col, local.row, grid.cols);
        if (grid.segmentGrid?.[idx]?.length) return;
        grid.grid[idx] = 0;
        patchStaticOccupancyCell(state, globalCol, globalRow, 0);
        state.staticCellHealth.delete(`${globalCol},${globalRow}`);
        anyRemoved = true;
        if (local.col < startCol) startCol = local.col;
        if (local.col > endCol) endCol = local.col;
        if (local.row < startRow) startRow = local.row;
        if (local.row > endRow) endRow = local.row;
    });
    if (!anyRemoved) return false;
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, true);
    return true;
}
/** @param {import("../state.js").TileLabGameState} state @param {import("./cellBoundsConfig.js").CellBoundsConfig} boundsConfig @param {number} heightLevel */
export function setStaticWallHeightInBounds(state, boundsConfig, heightLevel) {
    ensureLabObstacleGridCoverage(state, getCellBoundsAabb(boundsConfig, gridSettings.cellSize));
    const grid = state.obstacleGrid;
    const wallHeight = resolveStampWallHeight(heightLevel, gridSettings.cellSize);
    let startCol = Infinity;
    let endCol = -1;
    let startRow = Infinity;
    let endRow = -1;
    let any = false;
    forEachGlobalCellInBounds(boundsConfig, (globalCol, globalRow) => {
        const local = globalCellToLocal(grid, globalCol, globalRow);
        if (!local || !cellIsStaticBlocked(grid, local.col, local.row)) return;
        appendStaticOccupancyLayer(state, { originCol: globalCol, originRow: globalRow, cols: 1, rows: 1, wallHeight, cells: new Uint8Array([1]) });
        any = true;
        if (local.col < startCol) startCol = local.col;
        if (local.col > endCol) endCol = local.col;
        if (local.row < startRow) startRow = local.row;
        if (local.row > endRow) endRow = local.row;
    });
    if (!any) return false;
    notifyWallRegionChange(state, { startCol, endCol, startRow, endRow }, false);
    return true;
}
