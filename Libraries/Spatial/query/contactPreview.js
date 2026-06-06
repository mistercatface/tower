import { reflect2 } from "../../Math/Vec2.js";
import { circleLeadingPoint, circlePairStruckUnitDirection, circleWallContactPoint } from "../geometry/circleContact.js";
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
 *   obstacles?: { x: number, y: number, radius?: number }[],
 *   wallCtx?: import("./wallContext.js").WallContext | null,
 *   maxDist?: number,
 * }} spec
 * @returns {BodyContactPreview}
 */
export function computeBodyContactPreview({ body, nx, ny, obstacles = [], wallCtx = null, maxDist = 2400 }) {
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
        const { x: ux, y: uy } = circlePairStruckUnitDirection(hit.x, hit.y, other.x, other.y);
        const struckObstacles = obstacles.filter((o) => o !== other && o !== body);
        const nextHit = castCircleRay(other.x, other.y, ux, uy, struckRadius, maxDist, { wallCtx, circles: struckObstacles });
        let endX;
        let endY;
        if (nextHit) {
            endX = nextHit.x;
            endY = nextHit.y;
        } else {
            endX = other.x + ux * maxDist;
            endY = other.y + uy * maxDist;
        }
        return {
            primary,
            secondary: {
                kind: "circle",
                x1: other.x,
                y1: other.y,
                x2: endX,
                y2: endY,
            },
            hit,
        };
    }
    return { primary, secondary: null, hit };
}
