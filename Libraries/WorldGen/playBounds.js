/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldPlayBounds
 */
/**
 * @param {WorldPlayBounds | null | undefined} a
 * @param {WorldPlayBounds | null | undefined} b
 * @returns {WorldPlayBounds | null}
 */
export function intersectWorldBounds(a, b) {
    if (!a) return b ?? null;
    if (!b) return a;
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (minX >= maxX || minY >= maxY) return null;
    return { minX, minY, maxX, maxY };
}
/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, cols?: number } | null | undefined} grid
 * @param {number} [pad]
 * @returns {WorldPlayBounds | null}
 */
export function playBoundsFromObstacleGrid(grid, pad = 0) {
    if (!grid?.cols) return null;
    return { minX: grid.minX - pad, minY: grid.minY - pad, maxX: grid.maxX + pad, maxY: grid.maxY + pad };
}
