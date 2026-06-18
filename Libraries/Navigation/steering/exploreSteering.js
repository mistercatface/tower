import { cavernCellKey } from "../../Sandbox/cavernFloorCells.js";

export function cellChebyshevDistance(col0, row0, col1, row1) {
    return Math.max(Math.abs(col1 - col0), Math.abs(row1 - row0));
}

export function pickExploreDestination(grid, originCol, originRow, { minTiles = 8, visitedKeys = null, openCells, rng = Math.random } = {}) {
    const far = [];
    const unvisitedFar = [];
    for (let i = 0; i < openCells.length; i++) {
        const cell = openCells[i];
        if (cell.col === originCol && cell.row === originRow) continue;
        if (cellChebyshevDistance(originCol, originRow, cell.col, cell.row) < minTiles) continue;
        if (grid.isBlocked(cell.col, cell.row)) continue;
        far.push(cell);
        const key = cavernCellKey(cell.col, cell.row);
        if (!(visitedKeys?.has(key) ?? false)) unvisitedFar.push(cell);
    }
    const pool = unvisitedFar.length ? unvisitedFar : far;
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
}
