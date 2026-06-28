import { cellInRect } from "./GridUtils.js";
export function isNavWalkableCell(grid, navTopology, idx) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (grid.isBlockedIdx(idx)) return false;
    const col = idx % cols;
    // West
    if (col > 0) {
        const nIdx = idx - 1;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) return true;
    }
    // East
    if (col + 1 < cols) {
        const nIdx = idx + 1;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) return true;
    }
    // North
    if (idx >= cols) {
        const nIdx = idx - cols;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) return true;
    }
    // South
    if (idx < cols * (rows - 1)) {
        const nIdx = idx + cols;
        if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) return true;
    }
    return false;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ navCardinalOpen: Uint8Array, vertexPassability: Uint8Array, grid: import("./WorldObstacleGrid.js").WorldObstacleGrid, wallRevision: number }} navTopology
 * @param {{ col: number, row: number }[]} candidates
 * @param {Uint8Array} candidateMask
 * @param {number} cols
 * @param {number} rows
 * @param {{ col: number, row: number }[]} seedCells
 * @param {Uint8Array} reachedMask
 */
export function floodConnectedNavWalkableCells(grid, navTopology, candidates, candidateMask, cols, rows, seedCells, reachedMask) {
    reachedMask.fill(0);
    const queue = [];
    for (let i = 0; i < seedCells.length; i++) {
        const cell = seedCells[i];
        const idx = cell.col + cell.row * cols;
        if (!candidateMask[idx] || reachedMask[idx]) continue;
        reachedMask[idx] = 1;
        queue.push(idx);
    }
    while (queue.length) {
        const idx = queue.pop();
        const col = idx % cols;
        // West
        if (col > 0) {
            const nIdx = idx - 1;
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        }
        // East
        if (col + 1 < cols) {
            const nIdx = idx + 1;
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        }
        // North
        if (idx >= cols) {
            const nIdx = idx - cols;
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        }
        // South
        if (idx < cols * (rows - 1)) {
            const nIdx = idx + cols;
            if (candidateMask[nIdx] && !reachedMask[nIdx])
                if (grid.canStep(idx, nIdx, navTopology) || grid.canStep(nIdx, idx, navTopology)) {
                    reachedMask[nIdx] = 1;
                    queue.push(nIdx);
                }
        }
    }
    const connected = [];
    for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        if (reachedMask[cell.col + cell.row * cols]) connected.push(cell);
    }
    return connected;
}
