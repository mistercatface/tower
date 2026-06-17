import { minDistanceSegmentToWall } from "../geometry/WallGeometry.js";
import { collectWallSegmentsAlongLine } from "./wallSegmentQuery.js";
/**
 * @typedef {import("./wallContext.js").WallContext} WallContext
 */
/**
 * Corridor line-of-sight test against wall segments.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {WallContext | null | undefined} wallCtx
 * @param {number} [sourceRadius]
 * @param {number} [targetRadius]
 * @returns {boolean}
 */
export function hasLineOfSight(x1, y1, x2, y2, wallCtx, sourceRadius = 0, targetRadius = sourceRadius) {
    if (!wallCtx) return true;
    const corridorRadius = Math.max(sourceRadius, targetRadius);
    if (!wallCtx?.obstacleGrid) return true;
    const candidateWalls = collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2);
    for (let i = 0; i < candidateWalls.length; i++) {
        const seg = candidateWalls[i];
        if (seg.isDead) continue;
        if (minDistanceSegmentToWall(x1, y1, x2, y2, seg) <= corridorRadius) return false;
    }
    return true;
}
