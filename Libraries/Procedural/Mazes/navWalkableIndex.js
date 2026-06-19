import { cellInRect, colRowToIndex } from "../../Spatial/grid/GridUtils.js";
/** @param {Uint8Array} flags @param {number} cols @param {number} col @param {number} row */
export function readNavWalkableFlag(flags, cols, col, row) {
    return flags[colRowToIndex(col, row, cols)] !== 0;
}
/** @param {Uint8Array} flags @param {number} cols @param {{ col: number, row: number }[]} cells */
export function writeNavWalkableFlags(flags, cols, cells) {
    flags.fill(0);
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        flags[colRowToIndex(col, row, cols)] = 1;
    }
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number }[]} cells
 * @param {Uint8Array | null} [reuse]
 */
export function createNavWalkableCandidateMask(grid, cells, reuse = null) {
    const size = grid.cols * grid.rows;
    const mask = reuse && reuse.length === size ? reuse : new Uint8Array(size);
    mask.fill(0);
    for (let i = 0; i < cells.length; i++) {
        const { col, row } = cells[i];
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        mask[colRowToIndex(col, row, grid.cols)] = 1;
    }
    return mask;
}
/**
 * @param {number} cols
 * @param {number} rows
 * @param {Uint8Array | null} [reuse]
 */
export function createNavWalkableReachedMask(cols, rows, reuse = null) {
    const size = cols * rows;
    return reuse && reuse.length === size ? reuse : new Uint8Array(size);
}
