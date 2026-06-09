import { circleLeadingPoint } from "../geometry/circleContact.js";
import { rayCircleHitDistance } from "./circleCast.js";
import { castSteppedCircleRay } from "./steppedCircleRayCast.js";
/**
 * Estimate travel distance for a rolling body with initial speed v0 under friction damping.
 *
 * @param {number} v0
 * @param {object} strategy
 * @returns {number}
 */
export function estimateRollingTravelDistance(v0, strategy) {
    const fBase = strategy.friction ?? 0.5;
    const fLow = strategy.lowSpeedFriction ?? 2.8;
    const vTh = strategy.lowSpeedFrictionThreshold ?? 10;
    const sC = strategy.snapSpeed ?? 1.8;
    if (v0 <= sC) return 0;
    const b = fLow - fBase;
    if (Math.abs(b) < 1e-5) return (v0 - sC) / fBase;
    if (v0 >= vTh) {
        const d1 = (v0 - vTh) / fBase;
        const a = fBase;
        const uMax = 1 - sC / vTh;
        const d2 = (vTh / Math.sqrt(a * b)) * Math.atan(uMax * Math.sqrt(b / a));
        return d1 + d2;
    }
    const a = fBase;
    const uMax = 1 - sC / vTh;
    const uMin = 1 - v0 / vTh;
    const factor = vTh / Math.sqrt(a * b);
    const k = Math.sqrt(b / a);
    return factor * (Math.atan(uMax * k) - Math.atan(uMin * k));
}
/**
 * @typedef {object} CircleAimLineTarget
 * @property {number} x
 * @property {number} y
 * @property {number} [radius]
 */
/**
 * Aim arrow segment for a circle shot — stops at the nearest wall or circle target.
 * Same ray model as pool cue-ball preview ({@link castSteppedCircleRay} + {@link rayCircleHitDistance}).
 *
 * @param {{
 *   originX: number,
 *   originY: number,
 *   radius: number,
 *   nx: number,
 *   ny: number,
 *   maxTravelDist: number,
 *   wallCtx?: import("./wallContext.js").WallContext | null,
 *   circleTargets?: CircleAimLineTarget[],
 *   maxRayDist?: number,
 * }} options
 * @returns {{ x1: number, y1: number, x2: number, y2: number } | null}
 */
export function computeCircleAimLineSegment({ originX, originY, radius, nx, ny, maxTravelDist, wallCtx = null, circleTargets = [], maxRayDist = 2400 }) {
    const len = Math.hypot(nx, ny);
    if (len < 1e-6) return null;
    const dx = nx / len;
    const dy = ny / len;
    const angle = Math.atan2(dy, dx);
    let stopDist = Math.min(maxRayDist, maxTravelDist);
    for (const target of circleTargets) {
        const otherR = target.radius ?? radius;
        const t = rayCircleHitDistance(originX, originY, dx, dy, target.x, target.y, radius + otherR);
        if (t != null && t < stopDist) stopDist = t;
    }
    const wallHit = castSteppedCircleRay(originX, originY, angle, maxRayDist, radius, { wallCtx });
    if (wallHit.dist < stopDist) stopDist = wallHit.dist;
    const lead = circleLeadingPoint(originX, originY, radius, dx, dy);
    return { x1: lead.x, y1: lead.y, x2: originX + dx * (stopDist + radius), y2: originY + dy * (stopDist + radius) };
}
