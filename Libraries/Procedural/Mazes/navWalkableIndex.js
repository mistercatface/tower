/** @typedef {{ flags: Uint8Array, cols: number, rows: number }} NavWalkableIndex */
/** @param {NavWalkableIndex} index @param {number} idx */
export function isNavWalkableAt(index, idx) {
    if (idx < 0 || idx >= index.flags.length) return false;
    return index.flags[idx] !== 0;
}
/** @param {Uint8Array} flags */
export function countNavWalkableFlags(flags) {
    let count = 0;
    for (let i = 0; i < flags.length; i++) if (flags[i]) count++;
    return count;
}
/** @param {Uint8Array} flags @param {number} cols @param {{ col: number, row: number }[]} cells */
export function writeNavWalkableFlags(flags, cols, cells) {
    flags.fill(0);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (typeof cell === "number") flags[cell] = 1;
        else {
            const { col, row } = cell;
            flags[col + row * cols] = 1;
        }
    }
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {({ col: number, row: number }|number)[]} cells
 * @param {Uint8Array | null} [reuse]
 */
export function createNavWalkableCandidateMask(grid, cells, reuse = null) {
    const cols = grid.cols;
    const rows = grid.rows;
    const size = cols * rows;
    const mask = reuse && reuse.length === size ? reuse : new Uint8Array(size);
    mask.fill(0);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (typeof cell === "number") mask[cell] = 1;
        else {
            const { col, row } = cell;
            if (col >= 0 && col < cols && row >= 0 && row < rows) mask[col + row * cols] = 1;
        }
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
