/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldPlayBounds
 */
/**
 * @param {WorldPlayBounds} out
 * @param {WorldPlayBounds | null | undefined} a
 * @param {WorldPlayBounds | null | undefined} b
 * @returns {boolean}
 */
export function intersectWorldBoundsInto(out, a, b) {
    if (!a) {
        if (!b) return false;
        out.minX = b.minX;
        out.minY = b.minY;
        out.maxX = b.maxX;
        out.maxY = b.maxY;
        return true;
    }
    if (!b) {
        out.minX = a.minX;
        out.minY = a.minY;
        out.maxX = a.maxX;
        out.maxY = a.maxY;
        return true;
    }
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (minX >= maxX || minY >= maxY) return false;
    out.minX = minX;
    out.minY = minY;
    out.maxX = maxX;
    out.maxY = maxY;
    return true;
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
