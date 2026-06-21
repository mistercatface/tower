import { scoreOptions } from "../../AI/eqs/scoreOptions.js";
export function cellChebyshevDistance(col0, row0, col1, row1) {
    return Math.max(Math.abs(col1 - col0), Math.abs(row1 - row0));
}
const EXPLORE_RANDOM_ATTEMPTS = 16;
const EXPLORE_MEMORY_FRESH_REWARD = 100;
const EXPLORE_MEMORY_STALE_MAX_REWARD = 80;
const EXPLORE_DISTANCE_WEIGHT = 1;
function cellIsExploreCandidate(cell, originCol, originRow, minTiles) {
    return (cell.col !== originCol || cell.row !== originRow) && cellChebyshevDistance(originCol, originRow, cell.col, cell.row) >= minTiles;
}
function sampleExploreCandidates(openCells, rng, attempts) {
    const candidates = [];
    const seen = new Set();
    for (let i = 0; i < attempts; i++) {
        const cell = openCells[Math.floor(rng() * openCells.length)];
        const key = `${cell.col},${cell.row}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(cell);
    }
    return candidates;
}
function createExploreCellTests(originCol, originRow, minTiles, memory) {
    return [
        { id: "minRange", score: (cell) => (cellIsExploreCandidate(cell, originCol, originRow, minTiles) ? 0 : -Infinity) },
        { id: "distance", weight: EXPLORE_DISTANCE_WEIGHT, score: (cell) => cellChebyshevDistance(originCol, originRow, cell.col, cell.row) },
        {
            id: "memoryFreshness",
            score: (cell) => {
                if (!memory) return 0;
                const rank = memory.getRecencyRankFromNewest(cell.col, cell.row);
                if (rank < 0) return EXPLORE_MEMORY_FRESH_REWARD;
                const denominator = Math.max(memory.size - 1, 1);
                return (rank / denominator) * EXPLORE_MEMORY_STALE_MAX_REWARD;
            },
        },
    ];
}
export function pickExploreDestination(_grid, originCol, originRow, { minTiles, memory, openCells, rng = Math.random, attempts = EXPLORE_RANDOM_ATTEMPTS }) {
    if (!openCells.length) return null;
    const candidates = sampleExploreCandidates(openCells, rng, attempts);
    return scoreOptions(candidates, createExploreCellTests(originCol, originRow, minTiles, memory)).best;
}
