/** Moore-neighborhood threshold: out-of-bounds neighbors count as wall. */
export const DEFAULT_WALL_THRESHOLD = 5;
/**
 * @param {number} cols
 * @param {number} rows
 * @param {number} fillChance
 * @param {Uint8Array} [out]
 */
export function fillRandomGrid(cols, rows, fillChance, out) {
    const grid = out ?? new Uint8Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < fillChance ? 1 : 0;
    return grid;
}
/**
 * @param {number} cols
 * @param {number} rows
 * @param {Uint8Array} grid
 * @param {{ iterations: number, wallThreshold?: number, scratch?: Uint8Array }} options
 * @returns {Uint8Array}
 */
export function runCellularAutomata(cols, rows, grid, { iterations, wallThreshold = DEFAULT_WALL_THRESHOLD, scratch }) {
    let next = scratch ?? new Uint8Array(cols * rows);
    for (let iter = 0; iter < iterations; iter++) {
        for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
                let wallsCount = 0;
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (grid[nr * cols + nc] === 1) wallsCount++;
                        } else wallsCount++;
                    }
                next[r * cols + c] = wallsCount >= wallThreshold ? 1 : 0;
            }
        const temp = grid;
        grid = next;
        next = temp;
    }
    return grid;
}
/**
 * @param {number} cols
 * @param {number} rows
 * @param {{ fillChance: number, iterations: number, wallThreshold?: number }} options
 * @returns {Uint8Array}
 */
export function generateCellularAutomataGrid(cols, rows, { fillChance, iterations, wallThreshold = DEFAULT_WALL_THRESHOLD }) {
    let grid = fillRandomGrid(cols, rows, fillChance);
    return runCellularAutomata(cols, rows, grid, { iterations, wallThreshold, scratch: new Uint8Array(cols * rows) });
}
