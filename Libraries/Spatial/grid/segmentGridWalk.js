import { colRowToIndex } from "./GridUtils.js";

/**
 * @typedef {object} SegmentGridLayout
 * @property {object[][] | null} segmentGrid — per-cell segment lists (sparse)
 * @property {number} cols
 * @property {number} rows
 * @property {(x: number, y: number) => { col: number, row: number }} worldToGrid
 */

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

    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
            const cellSegs = segmentGrid[colRowToIndex(col, row, cols)];
            if (!cellSegs) continue;
            for (const segment of cellSegs) {
                if (!checked.has(segment)) {
                    checked.add(segment);
                    result.push(segment);
                }
            }
        }
    }

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

    return collectSegmentsInCellRect(
        layout.segmentGrid,
        layout.cols,
        startCol,
        endCol,
        startRow,
        endRow,
    );
}

/**
 * Bresenham walk along a world line through the segment grid.
 * @param {SegmentGridLayout} layout
 * @returns {object[]}
 */
export function collectSegmentsAlongLine(layout, x1, y1, x2, y2) {
    if (!layout.segmentGrid) return [];

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
        const cellSegs = layout.segmentGrid[colRowToIndex(c, r, layout.cols)];
        if (cellSegs) {
            for (const segment of cellSegs) {
                if (!checked.has(segment)) {
                    checked.add(segment);
                    result.push(segment);
                }
            }
        }

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
 * @param {SegmentGridLayout} layout
 * @returns {object[]}
 */
export function collectSegmentsInWorldBounds(layout, minX, minY, maxX, maxY) {
    if (!layout.segmentGrid) return [];

    const minGrid = layout.worldToGrid(minX, minY);
    const maxGrid = layout.worldToGrid(maxX, maxY);
    const startCol = Math.max(0, minGrid.col);
    const endCol = Math.min(layout.cols - 1, maxGrid.col);
    const startRow = Math.max(0, minGrid.row);
    const endRow = Math.min(layout.rows - 1, maxGrid.row);

    return collectSegmentsInCellRect(
        layout.segmentGrid,
        layout.cols,
        startCol,
        endCol,
        startRow,
        endRow,
    );
}

/** @param {{ segmentGrid: object[][] | null, cols: number, rows: number, worldToGrid: (x: number, y: number) => { col: number, row: number } }} grid */
export function segmentGridLayoutFromObstacleGrid(grid) {
    return {
        segmentGrid: grid.segmentGrid,
        cols: grid.cols,
        rows: grid.rows,
        worldToGrid: (x, y) => grid.worldToGrid(x, y),
    };
}
