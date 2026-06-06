import { reflect2 } from "../../Math/Vec2.js";
import { circleLeadingPoint, circleWallContactPoint } from "../geometry/circleContact.js";
import { estimateCirclePairStrikeFromRest } from "../collision/circlePairPreview.js";
import { castCircleRay } from "./circleCast.js";
/**
 * @typedef {object} ContactSegment
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */
/**
 * @typedef {object} BodyContactPreview
 * @property {ContactSegment} primary — leading circle edge to first contact on circle boundary
 * @property {(ContactSegment & { kind: "wall" | "circle" }) | null} secondary — one bounce or struck-body vector
 * @property {import("./circleCast.js").CircleCastHit | null} hit
 */
/**
 * First-contact preview for a circle body moving along a direction.
 * Uses the same swept-circle casts as {@link castCircleRay}; contact segments
 * follow the circle boundary (wall normal or line-of-centers), not aim-axis offsets.
 *
 * @param {{
 *   body: { x: number, y: number, radius?: number },
 *   nx: number,
 *   ny: number,
 *   speed?: number — cue speed for struck-ball impulse (defaults to 1)
 *   pairRestitution?: number — ball–ball restitution for struck prediction
 *   obstacles?: { x: number, y: number, radius?: number }[],
 *   wallCtx?: import("./wallContext.js").WallContext | null,
 *   maxDist?: number,
 * }} spec
 * @returns {BodyContactPreview}
 */
export function computeBodyContactPreview({ body, nx, ny, speed = 1, pairRestitution = 0.5, obstacles = [], wallCtx = null, maxDist = 2400 }) {
    const radius = body.radius ?? 8;
    const dirLen = Math.hypot(nx, ny);
    if (dirLen < 1e-6) return { primary: { x1: body.x, y1: body.y, x2: body.x, y2: body.y }, secondary: null, hit: null };
    const dx = nx / dirLen;
    const dy = ny / dirLen;
    const lead = circleLeadingPoint(body.x, body.y, radius, dx, dy);
    const hit = castCircleRay(body.x, body.y, dx, dy, radius, maxDist, { wallCtx, circles: obstacles });
    if (!hit) {
        const endCx = body.x + dx * maxDist;
        const endCy = body.y + dy * maxDist;
        const tail = circleWallContactPoint(endCx, endCy, radius, dx, dy);
        return { primary: { x1: lead.x, y1: lead.y, x2: tail.x, y2: tail.y }, secondary: null, hit: null };
    }
    const contact = { x: hit.surfaceX, y: hit.surfaceY };
    const primary = { x1: lead.x, y1: lead.y, x2: contact.x, y2: contact.y };
    if (hit.kind === "wall" && hit.nx != null && hit.ny != null) {
        const reflected = reflect2(dx, dy, hit.nx, hit.ny);
        const rLen = Math.hypot(reflected.dx, reflected.dy) || 1;
        const ux = reflected.dx / rLen;
        const uy = reflected.dy / rLen;
        return { primary, secondary: { kind: "wall", x1: contact.x, y1: contact.y, x2: contact.x + ux, y2: contact.y + uy }, hit };
    }
    if (hit.kind === "circle" && hit.entity) {
        const other = hit.entity;
        const struckRadius = other.radius ?? radius;
        const cueVx = dx * speed;
        const cueVy = dy * speed;
        const strike = estimateCirclePairStrikeFromRest(cueVx, cueVy, hit.x, hit.y, other.x, other.y, { restitution: pairRestitution });
        const cueSpeed = Math.hypot(cueVx, cueVy);
        const speedRatio = cueSpeed > 1e-6 ? strike.speed / cueSpeed : 0;
        let objUx = strike.normalX;
        let objUy = strike.normalY;
        if (strike.speed > 1e-4) {
            objUx = strike.vx / strike.speed;
            objUy = strike.vy / strike.speed;
        }
        const castMaxDist = Math.max(struckRadius * 2, maxDist * speedRatio);
        const struckObstacles = obstacles.filter((o) => o !== other && o !== body);
        const nextHit = strike.speed > 0.5 ? castCircleRay(other.x, other.y, objUx, objUy, struckRadius, castMaxDist, { wallCtx, circles: struckObstacles }) : null;
        let endX;
        let endY;
        if (nextHit) {
            endX = nextHit.x;
            endY = nextHit.y;
        } else if (strike.speed > 0.5) {
            endX = other.x + objUx * castMaxDist;
            endY = other.y + objUy * castMaxDist;
        } else {
            const tick = struckRadius * Math.max(0.12, speedRatio);
            endX = other.x + strike.normalX * tick;
            endY = other.y + strike.normalY * tick;
        }
        return { primary, secondary: { kind: "circle", x1: other.x, y1: other.y, x2: endX, y2: endY, cutFactor: strike.cutFactor, struckSpeed: strike.speed }, hit };
    }
    return { primary, secondary: null, hit };
}
