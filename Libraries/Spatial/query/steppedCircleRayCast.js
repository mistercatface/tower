import { circlesOverlap, findFirstCircleSegmentHit } from "../collision/overlap.js";
import { collectWallSegmentsAlongLine } from "./wallSegmentQuery.js";
/** @typedef {"wall" | "none" | string} SteppedCircleRayHitKind */
/**
 * @typedef {object} SteppedCircleRayHit
 * @property {SteppedCircleRayHitKind} hit
 * @property {number} x
 * @property {number} y
 * @property {number} dist — center-path distance along the ray at first contact
 * @property {object} [entity]
 */
/**
 * @typedef {object} SteppedCircleRayCircleTarget
 * @property {object} entity
 * @property {number} [radius]
 * @property {string} [hitKind] — returned as `hit` when struck (default `"circle"`)
 */
const DEFAULT_STEP = 8;
function collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, queryRadius) {
    if (!obstacleGrid) return [];
    const endX = startX + dx * maxDist;
    const endY = startY + dy * maxDist;
    return collectWallSegmentsAlongLine(obstacleGrid, startX, startY, endX, endY, queryRadius);
}
/**
 * @param {{ x: number, y: number, radius: number }} rayCircle
 * @param {object[]} candidateWalls
 * @returns {boolean}
 */
function rayCircleHitsWall(rayCircle, candidateWalls) {
    return findFirstCircleSegmentHit(rayCircle, candidateWalls) !== null;
}
/**
 * March a circle along a ray in fixed steps; first wall or circle contact wins.
 * Walls back-step to the last free center position; circles use center-distance minus radius.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} angle
 * @param {number} maxDist
 * @param {number} radius
 * @param {{
 *   obstacleGrid?: import("../grid/WorldObstacleGrid.js").WorldObstacleGrid | null,
 *   circles?: SteppedCircleRayCircleTarget[],
 *   step?: number,
 * }} [options]
 * @returns {SteppedCircleRayHit}
 */
export function castSteppedCircleRay(startX, startY, angle, maxDist, radius, { obstacleGrid = null, circles = [], step = DEFAULT_STEP, wallQueryRadius = radius } = {}) {
    let dist = 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let cx = startX;
    let cy = startY;
    const rayCircle = { x: cx, y: cy, radius };
    const candidateWalls = collectCandidateWalls(startX, startY, dx, dy, maxDist, obstacleGrid, wallQueryRadius);
    while (dist < maxDist) {
        cx += dx * step;
        cy += dy * step;
        dist += step;
        rayCircle.x = cx;
        rayCircle.y = cy;
        if (rayCircleHitsWall(rayCircle, candidateWalls)) {
            let hitWall = true;
            while (hitWall && dist > 0) {
                cx -= dx;
                cy -= dy;
                dist -= 1;
                rayCircle.x = cx;
                rayCircle.y = cy;
                hitWall = rayCircleHitsWall(rayCircle, candidateWalls);
            }
            return { hit: "wall", x: cx, y: cy, dist };
        }
        for (const target of circles) {
            const entity = target.entity;
            const entityRadius = target.radius ?? entity.radius ?? radius;
            if (!circlesOverlap(rayCircle, { x: entity.x, y: entity.y, radius: entityRadius })) continue;
            const distToTarget = Math.hypot(entity.x - startX, entity.y - startY);
            const exactDist = distToTarget - entityRadius;
            return { hit: target.hitKind ?? "circle", entity, x: startX + dx * exactDist, y: startY + dy * exactDist, dist: exactDist };
        }
    }
    return { hit: "none", x: cx, y: cy, dist };
}
