import { circleIntersectsSegment, getCircleSegmentPenetration } from "../geometry/WallGeometry.js";
import { getWallsAlongLine } from "./wallContext.js";

/**
 * @typedef {import("./wallContext.js").WallContext} WallContext
 * @typedef {"wall" | "circle"} CircleCastHitKind
 * @typedef {object} CircleCastHit
 * @property {CircleCastHitKind} kind
 * @property {number} t — distance along ray to body center at contact
 * @property {number} x — body center at contact
 * @property {number} y
 * @property {number} [nx] — wall push-out normal (wall hits only)
 * @property {number} [ny]
 * @property {object} [entity] — struck circle body (circle hits only)
 * @property {object} [segment] — wall segment (wall hits only)
 */

/**
 * @param {number} ox
 * @param {number} oy
 * @param {number} dx
 * @param {number} dy
 * @param {number} cx
 * @param {number} cy
 * @param {number} hitRadius — combined clearance radius at contact
 * @returns {number | null} distance along ray, or null if no forward hit
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

/**
 * @param {number} ox
 * @param {number} oy
 * @param {number} dx
 * @param {number} dy
 * @param {number} radius
 * @param {number} maxDist
 * @param {WallContext | null | undefined} wallCtx
 * @returns {CircleCastHit | null}
 */
function castCircleRayWallHit(ox, oy, dx, dy, radius, maxDist, wallCtx) {
    if (!wallCtx?.walls?.length) return null;
    const endX = ox + dx * maxDist;
    const endY = oy + dy * maxDist;
    const candidates = getWallsAlongLine(ox, oy, endX, endY, wallCtx);
    if (candidates.length === 0) return null;

    const step = 4;
    let hitDist = null;
    for (let dist = step; dist <= maxDist; dist += step) {
        const cx = ox + dx * dist;
        const cy = oy + dy * dist;
        const probe = { x: cx, y: cy, radius };
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            if (seg.isDead) continue;
            if (circleIntersectsSegment(probe, seg)) {
                hitDist = dist;
                break;
            }
        }
        if (hitDist != null) break;
    }
    if (hitDist == null) return null;

    while (hitDist > 0) {
        const cx = ox + dx * hitDist;
        const cy = oy + dy * hitDist;
        const probe = { x: cx, y: cy, radius };
        let inside = false;
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            if (seg.isDead) continue;
            if (circleIntersectsSegment(probe, seg)) {
                inside = true;
                break;
            }
        }
        if (!inside) break;
        hitDist -= 1;
    }

    let contactDist = hitDist + 1;
    while (contactDist <= maxDist) {
        const cx = ox + dx * contactDist;
        const cy = oy + dy * contactDist;
        const probe = { x: cx, y: cy, radius };
        for (let i = 0; i < candidates.length; i++) {
            const seg = candidates[i];
            if (seg.isDead) continue;
            if (!circleIntersectsSegment(probe, seg)) continue;
            const pen = getCircleSegmentPenetration(probe, seg);
            if (!pen) continue;
            return { kind: "wall", t: contactDist, x: cx, y: cy, nx: pen.normalX, ny: pen.normalY, segment: seg };
        }
        contactDist += 1;
    }
    return null;
}

/**
 * First contact along a ray for a circle body swept through the scene.
 * Uses the same wall broadphase and segment tests as combat line casts
 * ({@link circleIntersectsSegment}, {@link getCircleSegmentPenetration}, {@link getWallsAlongLine}).
 *
 * @param {number} ox — ray origin (body center)
 * @param {number} oy
 * @param {number} dx — unit direction
 * @param {number} dy
 * @param {number} radius
 * @param {number} maxDist
 * @param {{
 *   wallCtx?: WallContext | null,
 *   circles?: { x: number, y: number, radius?: number }[],
 * }} [options]
 * @returns {CircleCastHit | null}
 */
export function castCircleRay(ox, oy, dx, dy, radius, maxDist, { wallCtx = null, circles = [] } = {}) {
    let best = null;

    for (let i = 0; i < circles.length; i++) {
        const circle = circles[i];
        const otherRadius = circle.radius ?? radius;
        const combined = radius + otherRadius;
        const t = rayCircleHitDistance(ox, oy, dx, dy, circle.x, circle.y, combined);
        if (t == null || t > maxDist) continue;
        if (!best || t < best.t) {
            best = { kind: "circle", t, x: ox + dx * t, y: oy + dy * t, entity: circle };
        }
    }

    const wallHit = castCircleRayWallHit(ox, oy, dx, dy, radius, maxDist, wallCtx);
    if (wallHit && (!best || wallHit.t < best.t)) best = wallHit;

    return best;
}
