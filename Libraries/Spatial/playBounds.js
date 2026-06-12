import { padAabb, intersectAabbInto } from "../Math/Aabb2D.js";
/** @typedef {import("../Math/Aabb2D.js").Aabb2D} WorldPlayBounds */
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
    return intersectAabbInto(out, a, b);
}
/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, cols?: number } | null | undefined} grid
 * @param {number} [pad]
 * @returns {WorldPlayBounds | null}
 */
export function playBoundsFromObstacleGrid(grid, pad = 0) {
    if (!grid?.cols) return null;
    const bounds = { minX: grid.minX, minY: grid.minY, maxX: grid.maxX, maxY: grid.maxY };
    return pad ? padAabb(bounds, pad) : bounds;
}
