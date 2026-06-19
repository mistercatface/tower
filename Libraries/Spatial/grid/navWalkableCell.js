import { cellInRect } from "./GridUtils.js";
const CARDINALS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
];
export function isNavWalkableCell(grid, col, row) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    if (grid.isBlocked(col, row)) return false;
    for (let i = 0; i < CARDINALS.length; i++) {
        const nc = col + CARDINALS[i][0];
        const nr = row + CARDINALS[i][1];
        if (grid.canStep(col, row, nc, nr) || grid.canStep(nc, nr, col, row)) return true;
    }
    return false;
}
