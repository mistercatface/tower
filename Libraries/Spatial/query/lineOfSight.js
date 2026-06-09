import { distanceToSegment } from "../geometry/WallGeometry.js";
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
    let candidateWalls;
    if (wallCtx.obstacleGrid) candidateWalls = collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2);
    else if (wallCtx.wallSpatialIndex) {
        const minX = Math.min(x1, x2) - corridorRadius;
        const minY = Math.min(y1, y2) - corridorRadius;
        const maxX = Math.max(x1, x2) + corridorRadius;
        const maxY = Math.max(y1, y2) + corridorRadius;
        candidateWalls = wallCtx.wallSpatialIndex.collectInBounds(minX, minY, maxX, maxY);
    } else candidateWalls = wallCtx.walls;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLen = Math.hypot(dx, dy);
    if (lineLen === 0) return true;
    const steps = Math.max(2, Math.ceil(lineLen / 8));
    for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            if (distanceToSegment(seg, px, py) < corridorRadius) return false;
        }
    }
    return true;
}
