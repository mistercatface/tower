import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { cellInRect } from "../grid/GridUtils.js";
/**
 * @typedef {object} SegmentGridLayout
 * @property {object[][] | null} segmentGrid — per-cell segment lists (sparse)
 * @property {number} cols
 * @property {number} rows
 * @property {number} [cellSize] — world units per grid cell (for ray walk)
 * @property {number} [minX] — grid origin (world)
 * @property {number} [minY]
 * @property {(x: number, y: number) => { col: number, row: number }} worldToGrid
 */
/**
 * @param {object[][] | null} segmentGrid
 * @param {number} cols
 * @param {number} rows
 * @param {number} col
 * @param {number} row
 * @param {object[]} result
 * @param {Set<object>} checked
 */
function pushCellSegments(segmentGrid, cols, rows, col, row, result, checked) {
    if (!cellInRect(col, row, cols, rows)) return;
    const cellSegs = segmentGrid[col + row * cols];
    if (!cellSegs) return;
    for (const segment of cellSegs)
        if (!checked.has(segment)) {
            checked.add(segment);
            result.push(segment);
        }
}
/**
 * @param {object[][] | null} segmentGrid
 * @param {number} cols
 * @param {number} startCol
 * @param {number} endCol
 * @param {number} startRow
 * @param {number} endRow
 * @returns {object[]}
 */
export function collectSegmentsInCellRect(segmentGrid, cols, startCol, endCol, startRow, endRow) {
    if (!segmentGrid) return [];
    const result = [];
    const checked = new Set();
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (_col, _row, idx) => {
        const cellSegs = segmentGrid[idx];
        if (!cellSegs) return;
        for (const segment of cellSegs)
            if (!checked.has(segment)) {
                checked.add(segment);
                result.push(segment);
            }
    });
    return result;
}
/**
 * @param {SegmentGridLayout} layout
 * @param {{ x: number, y: number, radius?: number }} pose
 * @returns {object[]}
 */
export function collectSegmentsNearPose(layout, pose) {
    const reach = pose.radius ?? 0;
    const minGrid = layout.worldToGrid(pose.x - reach, pose.y - reach);
    const maxGrid = layout.worldToGrid(pose.x + reach, pose.y + reach);
    const startCol = Math.max(0, minGrid.col);
    const endCol = Math.min(layout.cols - 1, maxGrid.col);
    const startRow = Math.max(0, minGrid.row);
    const endRow = Math.min(layout.rows - 1, maxGrid.row);
    return collectSegmentsInCellRect(layout.segmentGrid, layout.cols, startCol, endCol, startRow, endRow);
}
/**
 * Bresenham walk — fallback when grid world metadata is unavailable.
 * @param {SegmentGridLayout} layout
 */
function collectSegmentsAlongLineBresenham(layout, x1, y1, x2, y2) {
    const p1 = layout.worldToGrid(x1, y1);
    const p2 = layout.worldToGrid(x2, y2);
    const col0 = Math.max(0, Math.min(layout.cols - 1, p1.col));
    const row0 = Math.max(0, Math.min(layout.rows - 1, p1.row));
    const col1 = Math.max(0, Math.min(layout.cols - 1, p2.col));
    const row1 = Math.max(0, Math.min(layout.rows - 1, p2.row));
    const dcol = Math.abs(col1 - col0);
    const drow = Math.abs(row1 - row0);
    const scol = col0 < col1 ? 1 : -1;
    const srow = row0 < row1 ? 1 : -1;
    let err = dcol - drow;
    let c = col0;
    let r = row0;
    const result = [];
    const checked = new Set();
    while (true) {
        pushCellSegments(layout.segmentGrid, layout.cols, layout.rows, c, r, result, checked);
        if (c === col1 && r === row1) break;
        const e2 = 2 * err;
        if (e2 > -drow) {
            err -= drow;
            c += scol;
        }
        if (e2 < dcol) {
            err += dcol;
            r += srow;
        }
    }
    return result;
}
/**
 * Visit every grid cell a world-space ray crosses (Amanatides & Woo).
 * Bresenham skips cells at shallow angles, which misses wall segments on pool rails.
 *
 * @param {SegmentGridLayout} layout
 * @returns {object[]}
 */
export function collectSegmentsAlongLine(layout, x1, y1, x2, y2) {
    if (!layout.segmentGrid) return [];
    const { cellSize, minX, minY, cols, rows, segmentGrid } = layout;
    if (cellSize == null || minX == null || minY == null) return collectSegmentsAlongLineBresenham(layout, x1, y1, x2, y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const result = [];
    const checked = new Set();
    if (dist < 1e-8) {
        const { col, row } = layout.worldToGrid(x1, y1);
        pushCellSegments(segmentGrid, cols, rows, col, row, result, checked);
        return result;
    }
    const dirX = dx / dist;
    const dirY = dy / dist;
    let col = Math.floor((x1 - minX) / cellSize);
    let row = Math.floor((y1 - minY) / cellSize);
    const endCol = Math.floor((x2 - minX) / cellSize);
    const endRow = Math.floor((y2 - minY) / cellSize);
    const stepX = dirX < 0 ? -1 : dirX > 0 ? 1 : 0;
    const stepY = dirY < 0 ? -1 : dirY > 0 ? 1 : 0;
    const tDeltaX = stepX === 0 ? Infinity : cellSize / Math.abs(dirX);
    const tDeltaY = stepY === 0 ? Infinity : cellSize / Math.abs(dirY);
    let tMaxX = stepX > 0 ? (minX + (col + 1) * cellSize - x1) / dirX : stepX < 0 ? (minX + col * cellSize - x1) / dirX : Infinity;
    let tMaxY = stepY > 0 ? (minY + (row + 1) * cellSize - y1) / dirY : stepY < 0 ? (minY + row * cellSize - y1) / dirY : Infinity;
    pushCellSegments(segmentGrid, cols, rows, col, row, result, checked);
    const guard = cols * rows + 4;
    let steps = 0;
    while ((col !== endCol || row !== endRow) && steps++ < guard) {
        if (tMaxX < tMaxY) {
            col += stepX;
            tMaxX += tDeltaX;
        } else if (tMaxY < tMaxX) {
            row += stepY;
            tMaxY += tDeltaY;
        } else {
            col += stepX;
            row += stepY;
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
        }
        pushCellSegments(segmentGrid, cols, rows, col, row, result, checked);
    }
    return result;
}
/**
 * @param {SegmentGridLayout} layout
 * @param {import("../../Math/Aabb2D.js").Aabb2D} bounds
 * @returns {object[]}
 */
export function collectSegmentsInWorldBounds(layout, bounds) {
    if (!layout.segmentGrid) return [];
    const minGrid = layout.worldToGrid(bounds.minX, bounds.minY);
    const maxGrid = layout.worldToGrid(bounds.maxX, bounds.maxY);
    const startCol = Math.max(0, minGrid.col);
    const endCol = Math.min(layout.cols - 1, maxGrid.col);
    const startRow = Math.max(0, minGrid.row);
    const endRow = Math.min(layout.rows - 1, maxGrid.row);
    return collectSegmentsInCellRect(layout.segmentGrid, layout.cols, startCol, endCol, startRow, endRow);
}
/** @param {{ segmentGrid: object[][] | null, cols: number, rows: number, cellSize: number, minX: number, minY: number, worldToGrid: (x: number, y: number) => { col: number, row: number } }} grid */
export function segmentGridLayoutFromObstacleGrid(grid) {
    return { segmentGrid: grid.segmentGrid, cols: grid.cols, rows: grid.rows, cellSize: grid.cellSize, minX: grid.minX, minY: grid.minY, worldToGrid: (x, y) => grid.worldToGrid(x, y) };
}
