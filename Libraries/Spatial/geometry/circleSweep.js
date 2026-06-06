import { getCircleSegmentPenetration, toSegmentLocal } from "./WallGeometry.js";
/**
 * @typedef {object} CircleSegmentSweepHit
 * @property {number} t — distance along ray to moving circle center at first touch
 * @property {number} x — center at contact
 * @property {number} y
 * @property {number} nx — wall push-out normal (world space)
 * @property {number} ny
 * @property {object} segment
 */
/** @param {number} vx @param {number} vy @param {number} angle */
function worldVectorToSegmentLocal(vx, vy, angle) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return { x: vx * cos - vy * sin, y: vy * cos + vx * sin };
}
/**
 * Ray vs AABB expanded by circle radius (segment-local space).
 * Returns distance along ray when the circle first touches the unexpanded box.
 *
 * @returns {number | null}
 */
export function rayExpandedLocalAabbHit(ox, oy, dx, dy, half, radius) {
    const minX = -half - radius;
    const maxX = half + radius;
    const minY = -half - radius;
    const maxY = half + radius;
    const slab = (origin, dir, min, max) => {
        if (Math.abs(dir) < 1e-10) {
            if (origin < min || origin > max) return null;
            return { enter: -Infinity, exit: Infinity };
        }
        let t0 = (min - origin) / dir;
        let t1 = (max - origin) / dir;
        if (t0 > t1) {
            const tmp = t0;
            t0 = t1;
            t1 = tmp;
        }
        return { enter: t0, exit: t1 };
    };
    const sx = slab(ox, dx, minX, maxX);
    if (!sx) return null;
    const sy = slab(oy, dy, minY, maxY);
    if (!sy) return null;
    const tEnter = Math.max(sx.enter, sy.enter);
    const tExit = Math.min(sx.exit, sy.exit);
    if (tEnter > tExit || tExit < 0) return null;
    const epsilon = 1e-5;
    if (tEnter >= epsilon) return tEnter;
    if (tExit >= epsilon) return 0;
    return null;
}
/**
 * Analytical swept circle vs one wall tile (rotated square segment).
 *
 * @param {number} ox @param {number} oy — circle center (ray origin)
 * @param {number} dx @param {number} dy — unit direction
 * @param {number} radius
 * @param {object} segment
 * @param {number} [maxDist]
 * @returns {CircleSegmentSweepHit | null}
 */
export function sweepCircleAgainstSegment(ox, oy, dx, dy, radius, segment, maxDist = Infinity) {
    if (segment.isDead) return null;
    const half = segment.size / 2;
    const { localX, localY } = toSegmentLocal(segment, ox, oy);
    const localDir = worldVectorToSegmentLocal(dx, dy, segment.angle);
    const t = rayExpandedLocalAabbHit(localX, localY, localDir.x, localDir.y, half, radius);
    if (t == null || t > maxDist) return null;
    const wx = ox + dx * t;
    const wy = oy + dy * t;
    let pen = getCircleSegmentPenetration({ x: wx, y: wy, radius }, segment, { approachX: dx, approachY: dy });
    if (!pen) {
        const nudge = 1e-3;
        pen = getCircleSegmentPenetration({ x: wx + dx * nudge, y: wy + dy * nudge, radius }, segment, { approachX: dx, approachY: dy });
    }
    if (!pen) return null;
    return { t, x: wx, y: wy, nx: pen.normalX, ny: pen.normalY, segment };
}
/**
 * Closest wall touch along a ray across many segments.
 *
 * @param {object[]} segments
 * @returns {CircleSegmentSweepHit | null}
 */
export function sweepCircleAgainstSegments(ox, oy, dx, dy, radius, segments, maxDist = Infinity) {
    let best = null;
    for (let i = 0; i < segments.length; i++) {
        const hit = sweepCircleAgainstSegment(ox, oy, dx, dy, radius, segments[i], maxDist);
        if (!hit) continue;
        if (!best || hit.t < best.t) best = hit;
    }
    return best;
}
