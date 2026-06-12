import { copyAabbInto, createAabb, padAabbInto } from "../Math/Aabb2D.js";
/**
 * @param {import("../Math/Aabb2D.js").Aabb2D} out
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, cols?: number } | null | undefined} grid
 * @param {number} [pad]
 * @returns {import("../Math/Aabb2D.js").Aabb2D | null}
 */
export function playBoundsFromObstacleGridInto(out, grid, pad = 0) {
    if (!grid?.cols) return null;
    copyAabbInto(out, grid);
    if (pad) padAabbInto(out, out, pad);
    return out;
}
/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, cols?: number } | null | undefined} grid
 * @param {number} [pad]
 * @returns {import("../Math/Aabb2D.js").Aabb2D | null}
 */
export function playBoundsFromObstacleGrid(grid, pad = 0) {
    if (!grid?.cols) return null;
    return playBoundsFromObstacleGridInto(createAabb(), grid, pad);
}
