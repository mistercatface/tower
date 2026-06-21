export function cellChebyshevDistance(col0, row0, col1, row1) {
    return Math.max(Math.abs(col1 - col0), Math.abs(row1 - row0));
}

const EXPLORE_RANDOM_ATTEMPTS = 16;

function cellIsExploreCandidate(cell, originCol, originRow, minTiles) {
    return (cell.col !== originCol || cell.row !== originRow) && cellChebyshevDistance(originCol, originRow, cell.col, cell.row) >= minTiles;
}

export function pickExploreDestination(_grid, originCol, originRow, { minTiles, memory, openCells, rng = Math.random, attempts = EXPLORE_RANDOM_ATTEMPTS }) {
    if (!openCells.length) return null;
    let rememberedCandidate = null;
    for (let i = 0; i < attempts; i++) {
        const cell = openCells[Math.floor(rng() * openCells.length)];
        if (!cellIsExploreCandidate(cell, originCol, originRow, minTiles)) continue;
        if (!memory || !memory.has(cell.col, cell.row)) return cell;
        rememberedCandidate = rememberedCandidate ?? cell;
    }
    return rememberedCandidate;
}
