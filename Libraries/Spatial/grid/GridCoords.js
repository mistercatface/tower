import { boundsToCellRect } from "../../DataStructures/CellKey.js";
import { createAabb, minCornerAabbInto } from "../../Math/Aabb2D.js";
export function worldColAtOrigin(x, minX, cellSize) {
    return Math.floor((x - minX) / cellSize);
}
export function worldRowAtOrigin(y, minY, cellSize) {
    return Math.floor((y - minY) / cellSize);
}
export function gridCenterXAtOrigin(col, minX, cellHalfSize) {
    return minX + col * (cellHalfSize * 2) + cellHalfSize;
}
export function gridCenterYAtOrigin(row, minY, cellHalfSize) {
    return minY + row * (cellHalfSize * 2) + cellHalfSize;
}
export function cellToChunkCoord(cell, cellsPerChunk) {
    return Math.floor(cell / cellsPerChunk);
}
export function remapChunkCoord(chunkCoord, cellOffset, cellsPerChunk) {
    return cellToChunkCoord(chunkCoord * cellsPerChunk + cellOffset, cellsPerChunk);
}
export function cellBoundsToChunkRange(cellBounds, cellsPerChunk) {
    return {
        startCol: cellToChunkCoord(cellBounds.startCol, cellsPerChunk),
        startRow: cellToChunkCoord(cellBounds.startRow, cellsPerChunk),
        endCol: cellToChunkCoord(cellBounds.endCol, cellsPerChunk),
        endRow: cellToChunkCoord(cellBounds.endRow, cellsPerChunk),
    };
}
export function chunkRangeToCellBounds(chunkBounds, cellsPerChunk, gridCols, gridRows) {
    const startCol = Math.max(0, chunkBounds.startCol * cellsPerChunk);
    const startRow = Math.max(0, chunkBounds.startRow * cellsPerChunk);
    const endCol = Math.min(gridCols - 1, (chunkBounds.endCol + 1) * cellsPerChunk - 1);
    const endRow = Math.min(gridRows - 1, (chunkBounds.endRow + 1) * cellsPerChunk - 1);
    if (startCol > endCol || startRow > endRow) return null;
    return { startCol, endCol, startRow, endRow };
}
/** Grid centered on a world point with pixel offsets (FlowFieldGrid). */
export function createCenteredGridFrame(cellSize, width, height, centerX = 0, centerY = 0) {
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    return { cellSize, width, height, cols, rows, offsetX: width / 2, offsetY: height / 2, centerX, centerY };
}
export function setCenteredGridFrameCenter(frame, centerX, centerY) {
    frame.centerX = centerX;
    frame.centerY = centerY;
    return frame;
}
export function centeredGridFrameKey(frame) {
    return `${frame.cols}:${frame.rows}:${frame.cellSize}:${frame.centerX}:${frame.centerY}`;
}
export function worldToGridCentered(x, y, centerX, centerY, offsetX, offsetY, cellSize) {
    return { col: Math.floor((x - centerX + offsetX) / cellSize), row: Math.floor((y - centerY + offsetY) / cellSize) };
}
export function worldColInCenteredFrame(frame, x) {
    return Math.floor((x - frame.centerX + frame.offsetX) / frame.cellSize);
}
export function worldRowInCenteredFrame(frame, y) {
    return Math.floor((y - frame.centerY + frame.offsetY) / frame.cellSize);
}
export function gridCenterXInCenteredFrame(frame, col) {
    return col * frame.cellSize + frame.centerX - frame.offsetX + frame.cellSize * 0.5;
}
export function gridCenterYInCenteredFrame(frame, row) {
    return row * frame.cellSize + frame.centerY - frame.offsetY + frame.cellSize * 0.5;
}
export function worldToGridInCenteredFrame(frame, x, y) {
    return { col: worldColInCenteredFrame(frame, x), row: worldRowInCenteredFrame(frame, y) };
}
export function gridToWorldCentered(col, row, centerX, centerY, offsetX, offsetY, cellSize) {
    return { x: col * cellSize + centerX - offsetX + cellSize / 2, y: row * cellSize + centerY - offsetY + cellSize / 2 };
}
export function gridToWorldInCenteredFrame(frame, col, row) {
    return { x: gridCenterXInCenteredFrame(frame, col), y: gridCenterYInCenteredFrame(frame, row) };
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function getCellBoundsCenteredInto(out, idx, cols, centerX, centerY, offsetX, offsetY, cellSize) {
    const row = (idx / cols) | 0;
    const col = idx - row * cols;
    const minX = col * cellSize + centerX - offsetX;
    const minY = row * cellSize + centerY - offsetY;
    return minCornerAabbInto(out, minX, minY, cellSize, cellSize);
}
export function getCellBoundsInCenteredFrameInto(out, frame, idx) {
    return getCellBoundsCenteredInto(out, idx, frame.cols, frame.centerX, frame.centerY, frame.offsetX, frame.offsetY, frame.cellSize);
}
export function getCellBoundsCentered(idx, cols, centerX, centerY, offsetX, offsetY, cellSize) {
    return getCellBoundsCenteredInto(createAabb(), idx, cols, centerX, centerY, offsetX, offsetY, cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function cellBoundsAtOriginInto(out, originMinX, originMinY, col, row, cellSize) {
    return minCornerAabbInto(out, originMinX + col * cellSize, originMinY + row * cellSize, cellSize, cellSize);
}
/** @param {import("../../Math/Aabb2D.js").Aabb2D} out */
export function cellBoundsAtOriginIdxInto(out, originMinX, originMinY, idx, cols, cellSize) {
    const row = (idx / cols) | 0;
    const col = idx - row * cols;
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
export function worldBoundsFromCellOriginInto(out, idx, gridCols, cols, rows, cellSize) {
    const row = (idx / gridCols) | 0;
    const col = idx - row * gridCols;
    const minX = col * cellSize;
    const minY = row * cellSize;
    return minCornerAabbInto(out, minX, minY, cols * cellSize, rows * cellSize);
}
export function worldBoundsFromCellOrigin(idx, gridCols, cols, rows, cellSize) {
    return worldBoundsFromCellOriginInto(createAabb(), idx, gridCols, cols, rows, cellSize);
}
/**
 * Visit each obstacle-grid cell overlapping a world AABB.
 * @param {{ minX: number, minY: number, cols: number, rows: number, cellSize: number }} grid
 * @param {import("../../Math/Aabb2D.js").Aabb2D} aabb
 * @param {(idx: number) => void} fn
 */
export function forEachObstacleGridCellInAabb(grid, aabb, fn) {
    const { minCol, maxCol, minRow, maxRow } = boundsToCellRect(aabb.minX - grid.minX, aabb.minY - grid.minY, aabb.maxX - grid.minX - 1e-6, aabb.maxY - grid.minY - 1e-6, grid.cellSize);
    const cMin = Math.max(0, minCol);
    const cMax = Math.min(grid.cols - 1, maxCol);
    const rMin = Math.max(0, minRow);
    const rMax = Math.min(grid.rows - 1, maxRow);
    const cols = grid.cols;
    for (let r = rMin; r <= rMax; r++) {
        const rowOffset = r * cols;
        for (let c = cMin; c <= cMax; c++) fn(rowOffset + c);
    }
}
