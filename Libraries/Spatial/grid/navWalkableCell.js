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
function navWalkableCellKey(col, row) {
    return `${col},${row}`;
}
export function floodConnectedNavWalkableCells(grid, candidates, candidateKeys, seedCells) {
    const reached = new Set();
    const queue = [];
    for (let i = 0; i < seedCells.length; i++) {
        const cell = seedCells[i];
        const key = navWalkableCellKey(cell.col, cell.row);
        if (!candidateKeys.has(key) || reached.has(key)) continue;
        reached.add(key);
        queue.push(cell);
    }
    while (queue.length) {
        const { col, row } = queue.pop();
        for (let i = 0; i < CARDINALS.length; i++) {
            const nc = col + CARDINALS[i][0];
            const nr = row + CARDINALS[i][1];
            const key = navWalkableCellKey(nc, nr);
            if (!candidateKeys.has(key) || reached.has(key)) continue;
            if (!grid.canStep(col, row, nc, nr) && !grid.canStep(nc, nr, col, row)) continue;
            reached.add(key);
            queue.push({ col: nc, row: nr });
        }
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        if (reached.has(navWalkableCellKey(cell.col, cell.row))) connected.push(cell);
    }
    return connected;
}
