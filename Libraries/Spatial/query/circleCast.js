import { sweepCircleAgainstSegments } from "../geometry/circleSweep.js";
import { circlePairContactPoint, circleWallContactPoint } from "../geometry/circleContact.js";
import { getWallsAlongLine } from "./wallContext.js";
/**
 * @typedef {import("./wallContext.js").WallContext} WallContext
 * @typedef {"wall" | "circle"} CircleCastHitKind
 * @typedef {object} CircleCastHit
 * @property {CircleCastHitKind} kind
 * @property {number} t — distance along ray to moving circle center at first contact
 * @property {number} x — circle center at contact
 * @property {number} y
 * @property {number} surfaceX — contact point on the moving circle boundary
 * @property {number} surfaceY
 * @property {number} [nx] — wall push-out normal (wall hits only)
 * @property {number} [ny]
 * @property {object} [entity] — struck circle body (circle hits only)
 * @property {object} [segment] — wall segment (wall hits only)
 */
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
/**
 * @param {number} ox @param {number} oy
 * @param {number} dx @param {number} dy
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
    const hit = sweepCircleAgainstSegments(ox, oy, dx, dy, radius, candidates, maxDist);
    if (!hit) return null;
    const surface = circleWallContactPoint(hit.x, hit.y, radius, hit.nx, hit.ny);
    return { kind: "wall", t: hit.t, x: hit.x, y: hit.y, surfaceX: surface.x, surfaceY: surface.y, nx: hit.nx, ny: hit.ny, segment: hit.segment };
}
/**
 * First contact along a ray for a circle body swept through the scene.
 * Walls use expanded-AABB analytic sweep + shared penetration normals;
 * circle pairs use quadratic ray–circle with combined radius.
 *
 * @param {number} ox — circle center (ray origin)
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
        const cx = ox + dx * t;
        const cy = oy + dy * t;
        const surface = circlePairContactPoint(cx, cy, radius, circle.x, circle.y);
        const candidate = { kind: "circle", t, x: cx, y: cy, surfaceX: surface.x, surfaceY: surface.y, entity: circle };
        if (!best || t < best.t) best = candidate;
    }
    const wallHit = castCircleRayWallHit(ox, oy, dx, dy, radius, maxDist, wallCtx);
    if (wallHit && (!best || wallHit.t < best.t)) best = wallHit;
    return best;
}
