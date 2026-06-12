/**
 * Static occupancy stamp metadata — wall height is fixed at stamp time, not from live editor config.
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
/** @typedef {{ originCol: number, originRow: number, cols: number, rows: number, wallHeight: number | null, cells: Uint8Array }} StaticOccupancyLayer */
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function cellIsStaticBlocked(grid, col, row) {
    if (!grid.isBlocked(col, row)) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[colRowToIndex(col, row, grid.cols)]?.length;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function gridCellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}
/** @param {object} state */
function bumpStaticOccupancyRevision(state) {
    state.staticOccupancyRevision++;
}
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {0 | 1} value */
export function patchStaticOccupancyCell(state, globalCol, globalRow, value) {
    const layers = state.staticOccupancyLayers;
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const lc = globalCol - layer.originCol;
        const lr = globalRow - layer.originRow;
        if (lc < 0 || lc >= layer.cols || lr < 0 || lr >= layer.rows) continue;
        layer.cells[lr * layer.cols + lc] = value;
        bumpStaticOccupancyRevision(state);
        return true;
    }
    return false;
}
/**
 * Append a stamp layer — previous stamps are kept.
 * @param {object} state
 * @param {StaticOccupancyLayer} layer
 */
export function appendStaticOccupancyLayer(state, layer) {
    state.staticOccupancyLayers.push({ ...layer, cells: layer.cells.slice() });
    bumpStaticOccupancyRevision(state);
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {StaticOccupancyLayer[] | null | undefined} layers
 * @returns {number | null | undefined} undefined = not in a stamped static layer
 */
export function resolveStaticWallHeightAtCell(grid, col, row, layers) {
    if (!layers?.length || !cellIsStaticBlocked(grid, col, row)) return undefined;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const lc = globalCol - layer.originCol;
        const lr = globalRow - layer.originRow;
        if (lc < 0 || lc >= layer.cols || lr < 0 || lr >= layer.rows) continue;
        if (layer.cells[lr * layer.cols + lc] !== 1) continue;
        return layer.wallHeight;
    }
    return undefined;
}
/** @param {StaticOccupancyLayer[] | null | undefined} layers @returns {number[]} Sorted unique explicit roof heights (>0). */
export function collectStaticRoofHeights(layers) {
    if (!layers?.length) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < layers.length; i++) {
        const h = layers[i].wallHeight;
        if (h == null || h <= 0 || seen.has(h)) continue;
        seen.add(h);
        out.push(h);
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
 * @param {StaticOccupancyLayer[] | null | undefined} layers
 */
export function chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, layers) {
    if (!obstacleGrid?.cols || !layers?.length) return false;
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row) => {
        if (resolveStaticWallHeightAtCell(obstacleGrid, col, row, layers) === zLevel) found = true;
    });
    return found;
}
