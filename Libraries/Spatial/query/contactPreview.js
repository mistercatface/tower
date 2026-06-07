import { lengthXY, normalizeXY, reflect2 } from "../../Math/Vec2.js";
import { circleLeadingPoint, circleWallContactPoint } from "../geometry/circleContact.js";
import { applyCirclePairContact } from "../collision/circlePair.js";
import { massFromBody } from "../../Motion/bodyMass.js";
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
    const { nx: dx, ny: dy, len: dirLen } = normalizeXY(nx, ny);
    if (dirLen < 1e-6) return { primary: { x1: body.x, y1: body.y, x2: body.x, y2: body.y }, secondary: null, hit: null };
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
        const rLen = lengthXY(reflected.dx, reflected.dy) || 1;
        const ux = reflected.dx / rLen;
        const uy = reflected.dy / rLen;
        return { primary, secondary: { kind: "wall", x1: contact.x, y1: contact.y, x2: contact.x + ux, y2: contact.y + uy }, hit };
    }
    if (hit.kind === "circle" && hit.entity) {
        const other = hit.entity;
        const struckRadius = other.radius ?? radius;
        const cueVx = dx * speed;
        const cueVy = dy * speed;
        const striker = { x: hit.x, y: hit.y, radius, vx: cueVx, vy: cueVy, mass: massFromBody(body) };
        const struck = { x: other.x, y: other.y, radius: struckRadius, vx: 0, vy: 0, mass: massFromBody(other) };
        let strike = applyCirclePairContact(striker, struck, { restitution: pairRestitution, separate: false, touchSlop: 1e-4 });
        if (!strike) {
            const { nx: normalX, ny: normalY, len: nd } = normalizeXY(other.x - hit.x, other.y - hit.y);
            strike = { normalX: nd > 1e-10 ? normalX : 1, normalY: nd > 1e-10 ? normalY : 0, bvx: 0, bvy: 0, cutFactor: 0, struckSpeed: 0 };
        }
        const cueSpeed = lengthXY(cueVx, cueVy);
        const speedRatio = cueSpeed > 1e-6 ? strike.struckSpeed / cueSpeed : 0;
        let objUx = strike.normalX;
        let objUy = strike.normalY;
        if (strike.struckSpeed > 1e-4) {
            objUx = strike.bvx / strike.struckSpeed;
            objUy = strike.bvy / strike.struckSpeed;
        }
        const castMaxDist = Math.max(struckRadius * 2, maxDist * speedRatio);
        const struckObstacles = obstacles.filter((o) => o !== other && o !== body);
        const nextHit = strike.struckSpeed > 0.5 ? castCircleRay(other.x, other.y, objUx, objUy, struckRadius, castMaxDist, { wallCtx, circles: struckObstacles }) : null;
        let endX;
        let endY;
        if (nextHit) {
            endX = nextHit.x;
            endY = nextHit.y;
        } else if (strike.struckSpeed > 0.5) {
            endX = other.x + objUx * castMaxDist;
            endY = other.y + objUy * castMaxDist;
        } else {
            const tick = struckRadius * Math.max(0.12, speedRatio);
            endX = other.x + strike.normalX * tick;
            endY = other.y + strike.normalY * tick;
        }
        return { primary, secondary: { kind: "circle", x1: other.x, y1: other.y, x2: endX, y2: endY, cutFactor: strike.cutFactor, struckSpeed: strike.struckSpeed }, hit };
    }
    return { primary, secondary: null, hit };
}
