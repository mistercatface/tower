/**
 * Static wall height levels stored on obstacleGrid.grid (0 = open, 1–9 = level, 10 = infiniwall).
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
import { STAMP_WALL_LEVEL_INFINI } from "../WorldSurface/stampWallHeight.js";

/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function cellIsStaticWall(grid, col, row) {
    if (!grid.isBlocked(col, row)) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[colRowToIndex(col, row, grid.cols)]?.length;
}

/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function gridCellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}

/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @returns {number} px height; 0 when not a static wall cell
 */
export function resolveCellWallHeightPx(grid, col, row, settings) {
    if (!cellIsStaticWall(grid, col, row)) return 0;
    const level = grid.getCellWallHeightLevel(col, row);
    if (level >= STAMP_WALL_LEVEL_INFINI) return getWallHeight(settings);
    return level * grid.cellSize;
}

/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings @returns {number[]} */
export function collectStaticRoofHeightsFromGrid(grid, settings) {
    if (!grid?.cols) return [];
    const seen = new Set();
    const out = [];
    for (let row = 0; row < grid.rows; row++)
        for (let col = 0; col < grid.cols; col++) {
            const px = resolveCellWallHeightPx(grid, col, row, settings);
            if (px <= 0 || seen.has(px)) continue;
            seen.add(px);
            out.push(px);
        }
    out.sort((a, b) => a - b);
    return out;
}

/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 */
export function chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, settings) {
    if (!obstacleGrid?.cols) return false;
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row) => {
        if (resolveCellWallHeightPx(obstacleGrid, col, row, settings) === zLevel) found = true;
    });
    return found;
}
