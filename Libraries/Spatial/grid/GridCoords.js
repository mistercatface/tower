import { boundsToCellRect } from "../../DataStructures/CellKey.js";
import { createAabb, minCornerAabbInto } from "../../Math/Aabb2D.js";
/** Grid anchored at a world-space min corner (ObstacleGrid). */
export function worldToGridAtOrigin(x, y, minX, minY, cellSize) {
    return { col: Math.floor((x - minX) / cellSize), row: Math.floor((y - minY) / cellSize) };
}
export function gridToWorldAtOrigin(col, row, minX, minY, cellSize) {
    return { x: minX + col * cellSize + cellSize / 2, y: minY + row * cellSize + cellSize / 2 };
}
/** Grid centered on a world point with pixel offsets (FlowFieldGrid). */
export function worldToGridCentered(x, y, centerX, centerY, offsetX, offsetY, cellSize) {
    return { col: Math.floor((x - centerX + offsetX) / cellSize), row: Math.floor((y - centerY + offsetY) / cellSize) };
}
export function gridToWorldCentered(col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    return { x: col * cellSize + centerX - offsetX + cellSize / 2, y: row * cellSize + centerY - offsetY + cellSize / 2 };
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function getCellBoundsCenteredInto(out, col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    const minX = col * cellSize + centerX - offsetX;
    const minY = row * cellSize + centerY - offsetY;
    return minCornerAabbInto(out, minX, minY, cellSize, cellSize);
}
export function getCellBoundsCentered(col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    return getCellBoundsCenteredInto(createAabb(), col, row, centerX, centerY, offsetX, offsetY, cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function cellBoundsAtOriginInto(out, originMinX, originMinY, col, row, cellSize) {
    return minCornerAabbInto(out, originMinX + col * cellSize, originMinY + row * cellSize, cellSize, cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function cellBoundsToWorldBoundsInto(out, bounds, originX, originY, cellSize) {
    out.minX = originX + bounds.startCol * cellSize;
    out.minY = originY + bounds.startRow * cellSize;
    out.maxX = originX + (bounds.endCol + 1) * cellSize;
    out.maxY = originY + (bounds.endRow + 1) * cellSize;
    return out;
}
export function cellBoundsToWorldBounds(bounds, originX, originY, cellSize) {
    return cellBoundsToWorldBoundsInto(createAabb(), bounds, originX, originY, cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function worldBoundsFromCellOriginInto(out, col, row, cols, rows, cellSize) {
    const minX = col * cellSize;
    const minY = row * cellSize;
    return minCornerAabbInto(out, minX, minY, cols * cellSize, rows * cellSize);
}
export function worldBoundsFromCellOrigin(col, row, cols, rows, cellSize) {
    return worldBoundsFromCellOriginInto(createAabb(), col, row, cols, rows, cellSize);
}
/** Snap a world point to the min corner of its obstacle-grid cell. */
export function snapWorldToCellOrigin(worldX, worldY, minX, minY, cellSize) {
    const col = Math.floor((worldX - minX) / cellSize);
    const row = Math.floor((worldY - minY) / cellSize);
    return { col, row, x: minX + col * cellSize, y: minY + row * cellSize };
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid @param {number} worldX @param {number} worldY */
export function snapWorldToObstacleCellCenter(obstacleGrid, worldX, worldY) {
    const { col, row } = obstacleGrid.worldToGrid(worldX, worldY);
    return { col, row, ...obstacleGrid.gridToWorld(col, row) };
}
/**
 * Visit each obstacle-grid cell overlapping a world AABB.
 * @param {{ minX: number, minY: number, cols: number, rows: number, cellSize: number }} grid
 * @param {import("../../Math/Aabb2D.js").Aabb2D} aabb
 * @param {(col: number, row: number, idx: number) => void} fn
 */
export function forEachObstacleGridCellInAabb(grid, aabb, fn) {
    const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(aabb.minX - grid.minX, aabb.minY - grid.minY, aabb.maxX - grid.minX - 1e-6, aabb.maxY - grid.minY - 1e-6, grid.cellSize);
    const colMin = Math.max(0, minCol);
    const colMax = Math.min(grid.cols - 1, maxCol);
    const rowMin = Math.max(0, minRow);
    const rowMax = Math.min(grid.rows - 1, maxRow);
    const cols = grid.cols;
    for (let row = rowMin; row <= rowMax; row++) {
        const rowOffset = row * cols;
        for (let col = colMin; col <= colMax; col++) fn(col, row, rowOffset + col);
    }
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out @param {number} originX @param {number} originY @param {number} sizePx @returns {import("../../Math/Aabb2D.js").Aabb2D} */
export function chunkWorldAabbInto(out, originX, originY, sizePx) {
    out.minX = originX;
    out.minY = originY;
    out.maxX = originX + sizePx;
    out.maxY = originY + sizePx;
    return out;
}
const CHUNK_AABB_SCRATCH = createAabb();
/** Sequential chunk AABB scratch — do not retain the returned reference. */
export function chunkWorldAabbScratch(originX, originY, sizePx) {
    return chunkWorldAabbInto(CHUNK_AABB_SCRATCH, originX, originY, sizePx);
}
