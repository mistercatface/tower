import { distanceToAabb } from "../../Math/Aabb2D.js";
export function getWallReach(wall, padding = wall.padding) {
    return (wall.size / 2) * Math.SQRT2 + padding;
}
/** Ground-plane corners of a wall segment prism (rotated square). */
export function getSegmentFootprintCorners(segment) {
    const cos = Math.cos(segment.angle);
    const sin = Math.sin(segment.angle);
    const hs = segment.size / 2;
    return [
        { x: segment.x + -hs * cos - -hs * sin, y: segment.y + -hs * sin + -hs * cos },
        { x: segment.x + hs * cos - -hs * sin, y: segment.y + hs * sin + -hs * cos },
        { x: segment.x + hs * cos - hs * sin, y: segment.y + hs * sin + hs * cos },
        { x: segment.x + -hs * cos - hs * sin, y: segment.y + -hs * sin + hs * cos },
    ];
}
export function toSegmentLocal(segment, x, y) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    if (segment._cos === undefined || segment._sin === undefined || segment._cachedAngle !== segment.angle) {
        segment._cachedAngle = segment.angle;
        segment._cos = Math.cos(-segment.angle);
        segment._sin = Math.sin(-segment.angle);
    }
    return { localX: dx * segment._cos - dy * segment._sin, localY: dx * segment._sin + dy * segment._cos, half: segment.size / 2 };
}
export function closestPointOnSegment(wall, x, y) {
    let { localX, localY, half } = toSegmentLocal(wall, x, y);
    localX = Math.max(-half, Math.min(half, localX));
    localY = Math.max(-half, Math.min(half, localY));
    const worldCos = wall._cos;
    const worldSin = -wall._sin;
    return { x: wall.x + localX * worldCos - localY * worldSin, y: wall.y + localX * worldSin + localY * worldCos };
}
export function distanceSqToSegment(segment, x, y) {
    if (segment.isDead) return Infinity;
    const { localX, localY, half } = toSegmentLocal(segment, x, y);
    const closestX = Math.max(-half, Math.min(localX, half));
    const closestY = Math.max(-half, Math.min(localY, half));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    return distDX * distDX + distDY * distDY;
}
export function distanceToSegment(wall, x, y) {
    const distSq = distanceSqToSegment(wall, x, y);
    return distSq === Infinity ? Infinity : Math.sqrt(distSq);
}
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const cross = d1x * (cy - ay) - d1y * (cx - ax);
    const cross2 = d1x * (dy - ay) - d1y * (dx - ax);
    const cross3 = d2x * (ay - cy) - d2y * (ax - cx);
    const cross4 = d2x * (by - cy) - d2y * (bx - cx);
    if (((cross >= 0 && cross2 <= 0) || (cross <= 0 && cross2 >= 0)) && ((cross3 >= 0 && cross4 <= 0) || (cross3 <= 0 && cross4 >= 0))) return true;
    return false;
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
export function distanceSegmentToSegment(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax;
    const uy = by - ay;
    const vx = dx - cx;
    const vy = dy - cy;
    const wx = ax - cx;
    const wy = ay - cy;
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sc;
    let sN;
    let sD = D;
    let tc;
    let tN;
    let tD = D;
    if (D < 1e-10) {
        sN = 0;
        sD = 1;
        tN = e;
        tD = c;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0) {
            sN = 0;
            tN = e;
            tD = c;
        } else if (sN > sD) {
            sN = sD;
            tN = e + b;
            tD = c;
        }
    }
    if (tN < 0) {
        tN = 0;
        if (-d < 0) sN = 0;
        else if (-d > a) sN = sD;
        else {
            sN = -d;
            sD = a;
        }
    } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0) sN = 0;
        else if (-d + b > a) sN = sD;
        else {
            sN = -d + b;
            sD = a;
        }
    }
    sc = Math.abs(sN) < 1e-10 ? 0 : sN / sD;
    tc = Math.abs(tN) < 1e-10 ? 0 : tN / tD;
    const px = ax + sc * ux;
    const py = ay + sc * uy;
    const qx = cx + tc * vx;
    const qy = cy + tc * vy;
    return Math.hypot(px - qx, py - qy);
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
    if (wall.isDead) return Infinity;
    const half = wall.size / 2;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const axL = (ax - wall.x) * cos - (ay - wall.y) * sin;
    const ayL = (ax - wall.x) * sin + (ay - wall.y) * cos;
    const bxL = (bx - wall.x) * cos - (by - wall.y) * sin;
    const byL = (bx - wall.x) * sin + (by - wall.y) * cos;
    return minDistanceSegmentToAabb(axL, ayL, bxL, byL, -half, -half, half, half);
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
    if (segment.isDead) return Infinity;
    const { localX, localY, half } = toSegmentLocal(segment, x, y);
    const distX = Math.max(0, Math.abs(localX) - half);
    const distY = Math.max(0, Math.abs(localY) - half);
    return distX * distX + distY * distY;
}
/**
 * Closest point on an axis-aligned box boundary (segment-local space).
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} half
 */
function closestPointOnLocalBoxSurface(localX, localY, half) {
    const insideX = localX > -half && localX < half;
    const insideY = localY > -half && localY < half;
    if (!insideX || !insideY) return { x: Math.max(-half, Math.min(localX, half)), y: Math.max(-half, Math.min(localY, half)) };
    const distToLeft = localX + half;
    const distToRight = half - localX;
    const distToTop = localY + half;
    const distToBottom = half - localY;
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    const eps = 1e-6;
    let sx = localX;
    let sy = localY;
    if (Math.abs(minDist - distToLeft) <= eps) sx = -half;
    if (Math.abs(minDist - distToRight) <= eps) sx = half;
    if (Math.abs(minDist - distToTop) <= eps) sy = -half;
    if (Math.abs(minDist - distToBottom) <= eps) sy = half;
    return { x: sx, y: sy };
}
/**
 * Outward push normal for a point on an axis-aligned box surface (segment-local space).
 *
 * @param {number} sx
 * @param {number} sy
 * @param {number} half
 */
function pushNormalAtLocalBoxSurface(sx, sy, half) {
    const eps = 1e-4;
    let nx = 0;
    let ny = 0;
    if (Math.abs(sx + half) < eps) nx -= 1;
    if (Math.abs(sx - half) < eps) nx += 1;
    if (Math.abs(sy + half) < eps) ny -= 1;
    if (Math.abs(sy - half) < eps) ny += 1;
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) return { x: 0, y: 1 };
    return { x: nx / len, y: ny / len };
}
/**
 * When the circle center sits inside the tile, pick the face it is moving toward.
 *
 * @param {number} localX
 * @param {number} localY
 * @param {number} half
 * @param {number} approachX — segment-local
 * @param {number} approachY
 */
function pushNormalFromInsideApproach(localX, localY, half, approachX, approachY) {
    const faces = [
        { nx: -1, ny: 0, dist: localX + half },
        { nx: 1, ny: 0, dist: half - localX },
        { nx: 0, ny: -1, dist: localY + half },
        { nx: 0, ny: 1, dist: half - localY },
    ];
    let best = null;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const toward = approachX * face.nx + approachY * face.ny;
        if (toward >= -1e-6) continue;
        if (!best || toward < best.toward - 1e-6 || (Math.abs(toward - best.toward) <= 1e-6 && face.dist < best.dist)) best = { ...face, toward };
    }
    if (best) return { nx: best.nx, ny: best.ny, dist: best.dist };
    const surface = closestPointOnLocalBoxSurface(localX, localY, half);
    const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, half);
    return { nx: fn.x, ny: fn.y, dist: Math.min(localX + half, half - localX, localY + half, half - localY) };
}
/** @param {object} segment @param {number} worldX @param {number} worldY */
export function isStrictlyInsideSegmentBox(segment, worldX, worldY) {
    const { localX, localY, half } = toSegmentLocal(segment, worldX, worldY);
    return localX > -half && localX < half && localY > -half && localY < half;
}
/** @param {object} segment @param {number} worldVx @param {number} worldVy */
function approachToSegmentLocal(segment, worldVx, worldVy) {
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    return { x: worldVx * cos - worldVy * sin, y: worldVx * sin + worldVy * cos };
}
/**
 * @param {object} circle
 * @param {object} segment
 * @param {{ approachX?: number, approachY?: number }} [options] — world-space motion hint for face selection
 */
export function getCircleSegmentPenetration(circle, segment, { approachX = 0, approachY = 0 } = {}) {
    if (segment.isDead) return null;
    const { localX, localY, half } = toSegmentLocal(segment, circle.x, circle.y);
    const localApproach = approachToSegmentLocal(segment, approachX, approachY);
    const hasApproach = Math.hypot(localApproach.x, localApproach.y) > 1e-6;
    const strictlyInside = localX > -half && localX < half && localY > -half && localY < half;
    const surface = closestPointOnLocalBoxSurface(localX, localY, half);
    const toCenterX = localX - surface.x;
    const toCenterY = localY - surface.y;
    const distanceSq = toCenterX * toCenterX + toCenterY * toCenterY;
    const radiusSq = circle.radius * circle.radius;
    if (distanceSq >= radiusSq) return null;
    let localNormX;
    let localNormY;
    let overlap;
    if (strictlyInside && hasApproach) {
        const face = pushNormalFromInsideApproach(localX, localY, half, localApproach.x, localApproach.y);
        localNormX = face.nx;
        localNormY = face.ny;
        overlap = circle.radius - face.dist;
    } else if (distanceSq <= 1e-10) {
        const fn = pushNormalAtLocalBoxSurface(surface.x, surface.y, half);
        localNormX = fn.x;
        localNormY = fn.y;
        overlap = circle.radius;
    } else {
        const distance = Math.sqrt(distanceSq);
        overlap = circle.radius - distance;
        localNormX = toCenterX / distance;
        localNormY = toCenterY / distance;
    }
    const invCos = Math.cos(segment.angle);
    const invSin = Math.sin(segment.angle);
    const normalX = localNormX * invCos - localNormY * invSin;
    const normalY = localNormX * invSin + localNormY * invCos;
    return { normalX, normalY, overlap, distanceSq };
}
export function pushPointFromWalls(x, y, walls, clearance) {
    let px = x;
    let py = y;
    for (let iter = 0; iter < 6; iter++)
        for (const wall of walls) {
            if (wall.isDead) continue;
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
