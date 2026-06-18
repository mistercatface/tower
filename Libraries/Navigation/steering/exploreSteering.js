export function cellChebyshevDistance(col0, row0, col1, row1) {
    return Math.max(Math.abs(col1 - col0), Math.abs(row1 - row0));
}
export function exploreFringeMinRankFromNewest(memory, fringeRatio) {
    return Math.max(0, Math.floor(memory.capacity * (1 - fringeRatio)) - 1);
}
export function pickExploreDestination(grid, originCol, originRow, { minTiles, memory, openCells, rng = Math.random, fringeRatio }) {
    const far = [];
    const fresh = [];
    const fringe = [];
    const stale = [];
    const fringeMinRank = memory ? exploreFringeMinRankFromNewest(memory, fringeRatio) : 0;
    for (let i = 0; i < openCells.length; i++) {
        const cell = openCells[i];
        if (cell.col === originCol && cell.row === originRow) continue;
        if (cellChebyshevDistance(originCol, originRow, cell.col, cell.row) < minTiles) continue;
        if (grid.isBlocked(cell.col, cell.row)) continue;
        far.push(cell);
        if (!memory) {
            fresh.push(cell);
            continue;
        }
        if (!memory.has(cell.col, cell.row)) {
            fresh.push(cell);
            continue;
        }
        const rankFromNewest = memory.getRecencyRankFromNewest(cell.col, cell.row);
        if (rankFromNewest >= fringeMinRank) fringe.push(cell);
        else stale.push(cell);
    }
    const pool = fresh.length ? fresh : fringe.length ? fringe : stale.length ? stale : far;
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
}
