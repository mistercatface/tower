import { minDistanceSegmentToWall, circleIntersectsSegment } from "../geometry/WallGeometry.js";
import { lengthXY } from "../../Math/Vec2.js";
// ==========================================
// 1. Ray Circle Hit Distance (from circleCast.js)
// ==========================================
/**
 * Analytic ray vs stationary circle: earliest center distance equal to combined radii.
 *
 * @param {number} ox @param {number} oy
 * @param {number} dx @param {number} dy — unit direction
 * @param {number} cx @param {number} cy
 * @param {number} hitRadius — sum of both circle radii at contact
 * @returns {number | null}
 */
export function rayCircleHitDistance(ox, oy, dx, dy, cx, cy, hitRadius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - hitRadius * hitRadius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const inv2a = 1 / (2 * a);
    const t1 = (-b - sqrt) * inv2a;
    const t2 = (-b + sqrt) * inv2a;
    const epsilon = 1e-4;
    if (t1 >= epsilon) return t1;
    if (t2 >= epsilon) return t2;
    return null;
}
// ==========================================
// 2. Wall Segment Query (from wallSegmentQuery.js)
// ==========================================
export function resolveWallSegmentQueryRadius(obstacleGrid, ...clearanceRadii) {
    const clearance = Math.max(...clearanceRadii, 0);
    return Math.max(clearance, obstacleGrid.cellSize + clearance);
}
export function collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, queryRadius) {
    obstacleGrid.resetStaticWallProxyPool();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / 8));
    const seen = new Set();
    const result = [];
    for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const batch = [];
        obstacleGrid.appendStaticWallProxiesNearWorld(x1 + dx * t, y1 + dy * t, queryRadius, batch);
        for (let i = 0; i < batch.length; i++) {
            const seg = batch[i];
            if (!seen.has(seg)) {
                seen.add(seg);
                result.push(seg);
            }
        }
    }
    return result;
}
// ==========================================
// 3. Line of Sight (from lineOfSight.js)
// ==========================================
export function hasLineOfSight(x1, y1, x2, y2, obstacleGrid, sourceRadius = 0, targetRadius = sourceRadius) {
    const corridorRadius = Math.max(sourceRadius, targetRadius);
    const segmentQueryRadius = resolveWallSegmentQueryRadius(obstacleGrid, corridorRadius);
    const candidateWalls = collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, segmentQueryRadius);
    for (let i = 0; i < candidateWalls.length; i++) {
        const seg = candidateWalls[i];
        if (minDistanceSegmentToWall(x1, y1, x2, y2, seg) <= corridorRadius) return false;
    }
    return true;
}
// ==========================================
// 4. Stepped Circle Ray Cast (from steppedCircleRayCast.js)
// ==========================================
/** @param {{ x: number, y: number, radius: number }} a @param {typeof a} b */
function circlesOverlap(a, b) {
    return lengthXY(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}
/**
 * First wall segment intersecting a circle (broadphase + precise test).
 * @param {{ x: number, y: number, radius: number }} circle
 * @param {object[]} segments
 * @returns {object | null}
 */
function findFirstCircleSegmentHit(circle, segments) {
    if (!segments || segments.length === 0) return null;
    const radius = circle.radius;
    for (const seg of segments) {
        const dx = circle.x - seg.x;
        const dy = circle.y - seg.y;
        const maxDist = radius + seg.size * 0.75;
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        if (circleIntersectsSegment(circle, seg)) return seg;
    }
    return null;
}
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
