import { cellInRect, colRowToIndex } from "./GridUtils.js";
const CARDINALS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];
export function isNavWalkableCell(grid, gridNavContext, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    for (let i = 0; i < CARDINALS.length; i++) {
        const nc = col + CARDINALS[i][0];
        const nr = row + CARDINALS[i][1];
        if (grid.canStep(col, row, nc, nr, gridNavContext) || grid.canStep(nc, nr, col, row, gridNavContext)) return true;
    }
    return false;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Navigation/GridNavContext.js").GridNavContext | { navCardinalOpen: Uint8Array, vertexPassability: Uint8Array }} gridNavContext
 * @param {{ col: number, row: number }[]} candidates
 * @param {Uint8Array} candidateMask
 * @param {number} cols
 * @param {number} rows
 * @param {{ col: number, row: number }[]} seedCells
 * @param {Uint8Array} reachedMask
 */
export function floodConnectedNavWalkableCells(grid, gridNavContext, candidates, candidateMask, cols, rows, seedCells, reachedMask) {
    reachedMask.fill(0);
    const queue = [];
    for (let i = 0; i < seedCells.length; i++) {
        const cell = seedCells[i];
        const idx = colRowToIndex(cell.col, cell.row, cols);
        if (!candidateMask[idx] || reachedMask[idx]) continue;
        reachedMask[idx] = 1;
        queue.push(cell);
    }
    while (queue.length) {
        const { col, row } = queue.pop();
        for (let i = 0; i < CARDINALS.length; i++) {
            const nc = col + CARDINALS[i][0];
            const nr = row + CARDINALS[i][1];
            if (!cellInRect(nc, nr, cols, rows)) continue;
            const nIdx = colRowToIndex(nc, nr, cols);
            if (!candidateMask[nIdx] || reachedMask[nIdx]) continue;
            if (!grid.canStep(col, row, nc, nr, gridNavContext) && !grid.canStep(nc, nr, col, row, gridNavContext)) continue;
            reachedMask[nIdx] = 1;
            queue.push({ col: nc, row: nr });
        }
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        if (reachedMask[colRowToIndex(cell.col, cell.row, cols)]) connected.push(cell);
    }
    return connected;
}
