import { distanceToAabb } from "../../Math/Aabb2D.js";
import { rectCorners, rotateXY, transformPoint2DInto } from "../../Math/Poly2D.js";
import { distanceSegmentToSegment, segmentsIntersect } from "../../Math/Segment2D.js";
export function getWallReach(wall, padding = wall.padding) {
    return (wall.size / 2) * Math.SQRT2 + padding;
}
/** Ground-plane corners of a wall segment prism (rotated square). */
export function getSegmentFootprintCorners(segment) {
    return rectCorners(segment.x, segment.y, segment.size / 2, segment.angle);
}
export function toSegmentLocal(segment, x, y) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    if (segment._cos === undefined || segment._sin === undefined || segment._cachedAngle !== segment.angle) {
        segment._cachedAngle = segment.angle;
        segment._cos = Math.cos(-segment.angle);
        segment._sin = Math.sin(-segment.angle);
    }
    const halfX = segment.width !== undefined ? segment.width / 2 : segment.size / 2;
    const halfY = segment.height !== undefined ? segment.height / 2 : segment.size / 2;
    const local = rotateXY(dx, dy, segment._cos, segment._sin);
    return { localX: local.x, localY: local.y, halfX, halfY };
}
export function closestPointOnSegment(wall, x, y) {
    let { localX, localY, halfX, halfY } = toSegmentLocal(wall, x, y);
    localX = Math.max(-halfX, Math.min(halfX, localX));
    localY = Math.max(-halfY, Math.min(halfY, localY));
    const worldCos = wall._cos;
    const worldSin = -wall._sin;
    return transformPoint2DInto({ x: 0, y: 0 }, wall.x, wall.y, localX, localY, worldCos, worldSin);
}
export function distanceSqToSegment(segment, x, y) {
    const { localX, localY, halfX, halfY } = toSegmentLocal(segment, x, y);
    const closestX = Math.max(-halfX, Math.min(localX, halfX));
    const closestY = Math.max(-halfY, Math.min(localY, halfY));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    return distDX * distDX + distDY * distDY;
}
export function distanceToSegment(wall, x, y) {
    const distSq = distanceSqToSegment(wall, x, y);
    return distSq === Infinity ? Infinity : Math.sqrt(distSq);
}
function segmentIntersectsAabb(ax, ay, bx, by, minX, minY, maxX, maxY) {
    if (distanceToAabb(ax, ay, minX, minY, maxX, maxY) === 0) return true;
    if (distanceToAabb(bx, by, minX, minY, maxX, maxY) === 0) return true;
    const edges = [
        [minX, minY, maxX, minY],
        [maxX, minY, maxX, maxY],
        [maxX, maxY, minX, maxY],
        [minX, maxY, minX, minY],
    ];
    for (const [ex0, ey0, ex1, ey1] of edges) if (segmentsIntersect(ax, ay, bx, by, ex0, ey0, ex1, ey1)) return true;
    return false;
}
function minDistanceSegmentToAabb(ax, ay, bx, by, minX, minY, maxX, maxY) {
    if (segmentIntersectsAabb(ax, ay, bx, by, minX, minY, maxX, maxY)) return 0;
    let minDist = Infinity;
    const edges = [
        [minX, minY, maxX, minY],
        [maxX, minY, maxX, maxY],
        [maxX, maxY, minX, maxY],
        [minX, maxY, minX, minY],
    ];
    for (const [ex0, ey0, ex1, ey1] of edges) minDist = Math.min(minDist, distanceSegmentToSegment(ax, ay, bx, by, ex0, ey0, ex1, ey1));
    minDist = Math.min(minDist, distanceToAabb(ax, ay, minX, minY, maxX, maxY));
    minDist = Math.min(minDist, distanceToAabb(bx, by, minX, minY, maxX, maxY));
    return minDist;
}
/** Minimum distance between a path segment and a wall's collision box. */
export function minDistanceSegmentToWall(ax, ay, bx, by, wall) {
    const halfX = wall.width !== undefined ? wall.width / 2 : wall.size / 2;
    const halfY = wall.height !== undefined ? wall.height / 2 : wall.size / 2;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const a = rotateXY(ax - wall.x, ay - wall.y, cos, sin);
    const b = rotateXY(bx - wall.x, by - wall.y, cos, sin);
    return minDistanceSegmentToAabb(a.x, a.y, b.x, b.y, -halfX, -halfY, halfX, halfY);
}
/** Closest point on path segment AB to wall box — used for push direction. */
export function findClosestPointOnPathToWall(ax, ay, bx, by, wall) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.01) return { x: ax, y: ay, t: 0, dist: distanceToSegment(wall, ax, ay) };
    const samples = Math.max(16, Math.ceil(segLen));
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const dist = distanceToSegment(wall, px, py);
        if (dist < bestDist) {
            bestDist = dist;
            bestT = t;
        }
    }
    let lo = Math.max(0, bestT - 1 / samples);
    let hi = Math.min(1, bestT + 1 / samples);
    for (let i = 0; i < 10; i++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        const d1 = distanceToSegment(wall, ax + (bx - ax) * m1, ay + (by - ay) * m1);
        const d2 = distanceToSegment(wall, ax + (bx - ax) * m2, ay + (by - ay) * m2);
        if (d1 < d2) hi = m2;
        else lo = m1;
    }
    const t = (lo + hi) / 2;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    return { x, y, t, dist: distanceToSegment(wall, x, y) };
}
export function circleIntersectsSegment(circle, segment) {
    const radiusSq = circle.radius * circle.radius;
    return distanceSqToSegment(segment, circle.x, circle.y) < radiusSq;
}
export function pointToSegmentPaddingDistanceSq(segment, x, y) {
    const { localX, localY, halfX, halfY } = toSegmentLocal(segment, x, y);
    const distX = Math.max(0, Math.abs(localX) - halfX);
    const distY = Math.max(0, Math.abs(localY) - halfY);
    return distX * distX + distY * distY;
}
/**
 * Closest point on an axis-aligned box boundary (segment-local space).
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} halfX
 * @param {number} halfY
 */
function closestPointOnLocalBoxSurface(localX, localY, halfX, halfY) {
    const insideX = localX > -halfX && localX < halfX;
    const insideY = localY > -halfY && localY < halfY;
    if (!insideX || !insideY) return { x: Math.max(-halfX, Math.min(localX, halfX)), y: Math.max(-halfY, Math.min(localY, halfY)) };
    const distToLeft = localX + halfX;
    const distToRight = halfX - localX;
    const distToTop = localY + halfY;
    const distToBottom = halfY - localY;
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    const eps = 1e-6;
    let sx = localX;
    let sy = localY;
    if (Math.abs(minDist - distToLeft) <= eps) sx = -halfX;
    if (Math.abs(minDist - distToRight) <= eps) sx = halfX;
    if (Math.abs(minDist - distToTop) <= eps) sy = -halfY;
    if (Math.abs(minDist - distToBottom) <= eps) sy = halfY;
    return { x: sx, y: sy };
}
/**
 * Outward push normal for a point on an axis-aligned box surface (segment-local space).
 *
 * @param {number} sx
 * @param {number} sy
 * @param {number} halfX
 * @param {number} halfY
 */
function pushNormalAtLocalBoxSurface(sx, sy, halfX, halfY) {
    const eps = 1e-4;
    let nx = 0;
    let ny = 0;
    if (Math.abs(sx + halfX) < eps) nx -= 1;
    if (Math.abs(sx - halfX) < eps) nx += 1;
    if (Math.abs(sy + halfY) < eps) ny -= 1;
    if (Math.abs(sy - halfY) < eps) ny += 1;
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) return { x: 0, y: 1 };
    return { x: nx / len, y: ny / len };
}
/**
 * When the circle center sits inside the tile, pick the face it is moving toward.
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} halfX
 * @param {number} halfY
 * @param {number} approachX — segment-local
 * @param {number} approachY
 */
function pushNormalFromInsideApproach(localX, localY, halfX, halfY, approachX, approachY) {
    const faces = [
        { nx: -1, ny: 0, dist: localX + halfX },
        { nx: 1, ny: 0, dist: halfX - localX },
        { nx: 0, ny: -1, dist: localY + halfY },
        { nx: 0, ny: 1, dist: halfY - localY },
    ];
    let best = null;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const toward = approachX * face.nx + approachY * face.ny;
        if (toward >= -1e-6) continue;
        if (!best || toward < best.toward - 1e-6 || (Math.abs(toward - best.toward) <= 1e-6 && face.dist < best.dist)) best = { ...face, toward };
    }
    if (best) return { nx: best.nx, ny: best.ny, dist: best.dist };
    const surface = closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, halfX, halfY);
    return { nx: fn.x, ny: fn.y, dist: Math.min(localX + halfX, halfX - localX, localY + halfY, halfY - localY) };
}
/** @param {object} segment @param {number} worldX @param {number} worldY */
export function isStrictlyInsideSegmentBox(segment, worldX, worldY) {
    const { localX, localY, halfX, halfY } = toSegmentLocal(segment, worldX, worldY);
    return localX > -halfX && localX < halfX && localY > -halfY && localY < halfY;
}
/** @param {object} segment @param {number} worldVx @param {number} worldVy */
function approachToSegmentLocal(segment, worldVx, worldVy) {
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    return rotateXY(worldVx, worldVy, cos, sin);
}
/**
 * @param {object} circle
 * @param {object} segment
 * @param {{ approachX?: number, approachY?: number }} [options] — world-space motion hint for face selection
 */
export function getCircleSegmentPenetration(circle, segment, { approachX = 0, approachY = 0 } = {}) {
    const { localX, localY, halfX, halfY } = toSegmentLocal(segment, circle.x, circle.y);
    const localApproach = approachToSegmentLocal(segment, approachX, approachY);
    const hasApproach = Math.hypot(localApproach.x, localApproach.y) > 1e-6;
    const strictlyInside = localX > -halfX && localX < halfX && localY > -halfY && localY < halfY;
    const surface = closestPointOnLocalBoxSurface(localX, localY, halfX, halfY);
    const toCenterX = localX - surface.x;
    const toCenterY = localY - surface.y;
    const distanceSq = toCenterX * toCenterX + toCenterY * toCenterY;
    const radiusSq = circle.radius * circle.radius;
    if (distanceSq > radiusSq + 1e-4) return null;
    let localNormX;
    let localNormY;
    let overlap;
    if (strictlyInside && hasApproach) {
        const face = pushNormalFromInsideApproach(localX, localY, halfX, halfY, localApproach.x, localApproach.y);
        localNormX = face.nx;
        localNormY = face.ny;
        overlap = circle.radius - face.dist;
    } else if (distanceSq <= 1e-10) {
        const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, halfX, halfY);
        localNormX = fn.x;
        localNormY = fn.y;
        overlap = circle.radius;
    } else {
        const distance = Math.sqrt(distanceSq);
        overlap = Math.max(0, circle.radius - distance);
        localNormX = toCenterX / distance;
        localNormY = toCenterY / distance;
    }
    const invCos = Math.cos(segment.angle);
    const invSin = Math.sin(segment.angle);
    const worldNormal = rotateXY(localNormX, localNormY, invCos, invSin);
    return { normalX: worldNormal.x, normalY: worldNormal.y, overlap, distanceSq };
}
export function pushPointFromWalls(x, y, walls, clearance) {
    let px = x;
    let py = y;
    for (let iter = 0; iter < 6; iter++)
        for (const wall of walls) {
            const closest = closestPointOnSegment(wall, px, py);
            let pushX = px - closest.x;
            let pushY = py - closest.y;
            let dist = Math.hypot(pushX, pushY);
            if (dist < 0.01) {
                pushX = px - wall.x;
                pushY = py - wall.y;
                dist = Math.hypot(pushX, pushY);
                if (dist < 0.01) {
                    pushX = Math.cos(wall.angle + Math.PI / 2);
                    pushY = Math.sin(wall.angle + Math.PI / 2);
                    dist = 1;
                }
            }
            if (dist < clearance) {
                const scale = (clearance - dist) / dist;
                px += pushX * scale;
                py += pushY * scale;
            }
        }
    return { x: px, y: py };
}
