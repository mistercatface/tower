/**
 * Static occupancy stamp metadata — wall height is fixed at stamp time, not from live editor config.
 */
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { unionGridCellRect } from "../Spatial/grid/wallGridBake.js";
/** @typedef {{ originCol: number, originRow: number, cols: number, rows: number, wallHeight: number | null, cells: Uint8Array }} StaticOccupancyLayer */
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function cellIsStaticBlocked(grid, col, row) {
    if (!grid.isBlocked(col, row)) return false;
    if (!grid.segmentGrid) return true;
    return !grid.segmentGrid[colRowToIndex(col, row, grid.cols)]?.length;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
function gridCellToGlobalColRow(grid, col, row) {
    const cellSize = grid.cellSize;
    return { globalCol: Math.floor((grid.minX + col * cellSize) / cellSize), globalRow: Math.floor((grid.minY + row * cellSize) / cellSize) };
}
/** @param {StaticOccupancyLayer} a @param {StaticOccupancyLayer} b */
function layersOverlap(a, b) {
    const aMaxCol = a.originCol + a.cols;
    const aMaxRow = a.originRow + a.rows;
    const bMaxCol = b.originCol + b.cols;
    const bMaxRow = b.originRow + b.rows;
    return a.originCol < bMaxCol && aMaxCol > b.originCol && a.originRow < bMaxRow && aMaxRow > b.originRow;
}
/**
 * Append a stamp layer — previous stamps are kept.
 * @param {object} state
 * @param {StaticOccupancyLayer} layer
 */
export function appendStaticOccupancyLayer(state, layer) {
    if (!state.staticOccupancyLayers) state.staticOccupancyLayers = [];
    state.staticOccupancyLayers.push({ ...layer, cells: layer.cells.slice() });
}
/**
 * Replace any layers overlapping the new stamp and append it.
 * @param {object} state
 * @param {StaticOccupancyLayer} layer
 */
export function upsertStaticOccupancyLayer(state, layer) {
    if (!state.staticOccupancyLayers) state.staticOccupancyLayers = [];
    const layers = state.staticOccupancyLayers;
    for (let i = layers.length - 1; i >= 0; i--) if (layersOverlap(layers[i], layer)) layers.splice(i, 1);
    layers.push(layer);
}
/**
 * Restore all stamped static layers onto the obstacle grid (after grid rebuild/expand).
 * @param {object} state
 * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null}
 */
export function reapplyStaticOccupancyLayers(state) {
    const layers = state.staticOccupancyLayers;
    const grid = state.obstacleGrid;
    if (!layers?.length || !grid?.cols) return null;
    let bounds = null;
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer.cells) continue;
        const patch = grid.stampStaticOccupancy(layer.originCol, layer.originRow, layer.cols, layer.rows, layer.cells, state.wallSpatialIndex, { additive: true });
        bounds = bounds ? unionGridCellRect(bounds, patch) : patch;
    }
    return bounds;
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
    forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
        if (resolveStaticWallHeightAtCell(obstacleGrid, col, row, layers) === zLevel) found = true;
    });
    return found;
}
