/**
 * Static wall height levels stored on obstacleGrid.grid (0 = open, 1 … maxWallHeightLevel).
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx */
export function gridValueAtIdx(grid, idx) {
    return grid.grid[idx];
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx */
export function cellIsStaticWallAtIdx(grid, idx) {
    if (grid.grid[idx] === 0) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[idx]?.length;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} idx @returns {number} px height; 0 when not a static wall cell */
export function resolveCellWallHeightAtIdx(grid, idx) {
    const level = grid.grid[idx];
    if (level === 0) return 0;
    if (grid.segmentGrid?.[idx]?.length) return 0;
    return level * grid.cellSize;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function cellIsStaticWall(grid, col, row) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    return cellIsStaticWallAtIdx(grid, colRowToIndex(col, row, grid.cols));
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
 * @returns {number} px height; 0 when not a static wall cell
 */
export function resolveCellWallHeightPx(grid, col, row) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return 0;
    return resolveCellWallHeightAtIdx(grid, colRowToIndex(col, row, grid.cols));
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @returns {number[]} */
export function collectStaticRoofHeightsFromGrid(grid) {
    const seen = new Set();
    const out = [];
    for (let row = 0; row < grid.rows; row++)
        for (let col = 0; col < grid.cols; col++) {
            const px = resolveCellWallHeightPx(grid, col, row);
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
 */
export function chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) === zLevel) found = true;
    });
    return found;
}
