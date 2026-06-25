import { distanceToAabb } from "../../Math/Aabb2D.js";
import { rectCorners, rotateXY, transformPoint2DInto } from "../../Math/Poly2D.js";
import { distanceSqToLineSegment } from "../../Math/Segment2D.js";
export function getWallReach(wall, padding = wall.padding) {
    return (wall.size / 2) * Math.SQRT2 + padding;
}
/** Ground-plane corners of a wall segment prism (rotated square). */
export function getSegmentFootprintCorners(segment) {
    return rectCorners(segment.x, segment.y, segment.size / 2, segment.angle);
}
const LOCAL_SCRATCH = { localX: 0, localY: 0, halfX: 0, halfY: 0 };
function segmentHalfExtents(segment) {
    return { halfX: (segment.width !== undefined ? segment.width : segment.size) * 0.5, halfY: (segment.height !== undefined ? segment.height : segment.size) * 0.5 };
}
export function toSegmentLocal(segment, x, y, out = LOCAL_SCRATCH) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    const { halfX, halfY } = segmentHalfExtents(segment);
    out.halfX = halfX;
    out.halfY = halfY;
    out.localX = dx * cos - dy * sin;
    out.localY = dx * sin + dy * cos;
    return out;
}
export function closestPointOnSegment(wall, x, y) {
    const dx = x - wall.x;
    const dy = y - wall.y;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const { halfX, halfY } = segmentHalfExtents(wall);
    let localX = dx * cos - dy * sin;
    let localY = dx * sin + dy * cos;
    localX = Math.max(-halfX, Math.min(halfX, localX));
    localY = Math.max(-halfY, Math.min(halfY, localY));
    return transformPoint2DInto({ x: 0, y: 0 }, wall.x, wall.y, localX, localY, cos, -sin);
}
export function distanceSqToSegment(segment, x, y) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    const { halfX, halfY } = segmentHalfExtents(segment);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
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
    let codeA = 0;
    if (ax < minX) codeA |= 1;
    else if (ax > maxX) codeA |= 2;
    if (ay < minY) codeA |= 4;
    else if (ay > maxY) codeA |= 8;
    let codeB = 0;
    if (bx < minX) codeB |= 1;
    else if (bx > maxX) codeB |= 2;
    if (by < minY) codeB |= 4;
    else if (by > maxY) codeB |= 8;
    if ((codeA | codeB) === 0) return true;
    if ((codeA & codeB) !== 0) return false;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx !== 0) {
        let t = (minX - ax) / dx;
        if (t >= 0 && t <= 1) {
            let y = ay + t * dy;
            if (y >= minY && y <= maxY) return true;
        }
        t = (maxX - ax) / dx;
        if (t >= 0 && t <= 1) {
            let y = ay + t * dy;
            if (y >= minY && y <= maxY) return true;
        }
    }
    if (dy !== 0) {
        let t = (minY - ay) / dy;
        if (t >= 0 && t <= 1) {
            let x = ax + t * dx;
            if (x >= minX && x <= maxX) return true;
        }
        t = (maxY - ay) / dy;
        if (t >= 0 && t <= 1) {
            let x = ax + t * dx;
            if (x >= minX && x <= maxX) return true;
        }
    }
    return false;
}
function minDistanceSegmentToAabb(ax, ay, bx, by, minX, minY, maxX, maxY) {
    if (segmentIntersectsAabb(ax, ay, bx, by, minX, minY, maxX, maxY)) return 0;
    const distA = distanceToAabb(ax, ay, minX, minY, maxX, maxY);
    const distB = distanceToAabb(bx, by, minX, minY, maxX, maxY);
    let minSq = Math.min(
        distA * distA,
        distB * distB,
        distanceSqToLineSegment(minX, minY, ax, ay, bx, by),
        distanceSqToLineSegment(maxX, minY, ax, ay, bx, by),
        distanceSqToLineSegment(maxX, maxY, ax, ay, bx, by),
        distanceSqToLineSegment(minX, maxY, ax, ay, bx, by),
    );
    return Math.sqrt(minSq);
}
/** Minimum distance between a path segment and a wall's collision box. */
export function minDistanceSegmentToWall(ax, ay, bx, by, wall) {
    const halfX = (wall.width !== undefined ? wall.width : wall.size) * 0.5;
    const halfY = (wall.height !== undefined ? wall.height : wall.size) * 0.5;
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
    const samples = Math.min(256, Math.max(16, Math.ceil(segLen)));
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
export function getLinkCapsuleSegmentPenetration(ax, ay, bx, by, capsuleRadius, segment, { approachX = 0, approachY = 0 } = {}) {
    if (minDistanceSegmentToWall(ax, ay, bx, by, segment) >= capsuleRadius - 1e-5) return null;
    const closest = findClosestPointOnPathToWall(ax, ay, bx, by, segment);
    const circlePen = getCircleSegmentPenetration({ x: closest.x, y: closest.y, radius: capsuleRadius }, segment, { approachX, approachY });
    if (circlePen) return circlePen;
    if (closest.dist >= capsuleRadius) return null;
    const wallPoint = closestPointOnSegment(segment, closest.x, closest.y);
    let normalX = closest.x - wallPoint.x;
    let normalY = closest.y - wallPoint.y;
    const len = Math.hypot(normalX, normalY);
    if (len < 1e-8) return null;
    normalX /= len;
    normalY /= len;
    return { normalX, normalY, overlap: capsuleRadius - closest.dist, distanceSq: closest.dist * closest.dist };
}
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
