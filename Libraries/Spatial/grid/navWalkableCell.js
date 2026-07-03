import { cellInRect, forEachCardinalNeighborIdx } from "./GridUtils.js";
export function canStepEitherDirection(grid, navTopology, idx, nIdx) {
    return grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology);
}
export function isNavWalkableCell(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (grid.isBlockedIdx(idx)) return false;
    let walkable = false;
    forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
        if (walkable) return;
        if (canStepEitherDirection(grid, navTopology, idx, nIdx)) walkable = true;
    });
    return walkable;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {object} navTopology
 * @param {({ col: number, row: number }|number)[]} candidates
 * @param {Uint8Array} candidateMask
 * @param {number} cols
 * @param {number} rows
 * @param {({ col: number, row: number }|number)[]} seedCells
 * @param {Uint8Array} reachedMask
 */
export function floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, cols, rows, seedCells, reachedMask) {
    reachedMask.fill(0);
    const queue = [];
    for (let i = 0; i < seedCells.length; i++) {
        const cell = seedCells[i];
        const idx = typeof cell === "number" ? cell : cell.col + cell.row * cols;
        if (!candidateMask[idx] || reachedMask[idx]) continue;
        reachedMask[idx] = 1;
        queue.push(idx);
    }
    while (queue.length) {
        const idx = queue.pop();
        forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (canStepEitherDirection(grid, navTopology, idx, nIdx)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        });
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        const idx = typeof cell === "number" ? cell : cell.col + cell.row * cols;
        if (reachedMask[idx]) connected.push(cell);
    }
    return connected;
}
