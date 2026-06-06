import { reflect2 } from "../../Math/Vec2.js";
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
 * @property {ContactSegment} primary — moving body surface to first contact
 * @property {(ContactSegment & { kind: "wall" | "circle" }) | null} secondary — one bounce or struck-body vector
 * @property {import("./circleCast.js").CircleCastHit | null} hit
 */

/**
 * First-contact preview for a circle body moving along a direction.
 * Primary segment stops at the first wall or circle hit; one secondary segment, no recursion.
 *
 * Wall hit → reflected direction from contact point.
 * Circle hit → direction the struck body would travel (line of centers at contact).
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
    if (dirLen < 1e-6) {
        return {
            primary: { x1: body.x, y1: body.y, x2: body.x, y2: body.y },
            secondary: null,
            hit: null,
        };
    }
    const dx = nx / dirLen;
    const dy = ny / dirLen;

    const hit = castCircleRay(body.x, body.y, dx, dy, radius, maxDist, { wallCtx, circles: obstacles });
    const surfaceStartX = body.x + dx * radius;
    const surfaceStartY = body.y + dy * radius;

    if (!hit) {
        const endX = body.x + dx * maxDist;
        const endY = body.y + dy * maxDist;
        return {
            primary: { x1: surfaceStartX, y1: surfaceStartY, x2: endX - dx * radius, y2: endY - dy * radius },
            secondary: null,
            hit: null,
        };
    }

    const contactSurfaceX = hit.x - dx * radius;
    const contactSurfaceY = hit.y - dy * radius;
    const primary = { x1: surfaceStartX, y1: surfaceStartY, x2: contactSurfaceX, y2: contactSurfaceY };

    if (hit.kind === "wall" && hit.nx != null && hit.ny != null) {
        const reflected = reflect2(dx, dy, hit.nx, hit.ny);
        const rLen = Math.hypot(reflected.dx, reflected.dy) || 1;
        const ux = reflected.dx / rLen;
        const uy = reflected.dy / rLen;
        return {
            primary,
            secondary: {
                kind: "wall",
                x1: contactSurfaceX,
                y1: contactSurfaceY,
                x2: contactSurfaceX + ux,
                y2: contactSurfaceY + uy,
            },
            hit,
        };
    }

    if (hit.kind === "circle" && hit.entity) {
        const other = hit.entity;
        const odx = other.x - hit.x;
        const ody = other.y - hit.y;
        const oLen = Math.hypot(odx, ody) || 1;
        const ux = odx / oLen;
        const uy = ody / oLen;
        return {
            primary,
            secondary: {
                kind: "circle",
                x1: other.x,
                y1: other.y,
                x2: other.x + ux,
                y2: other.y + uy,
            },
            hit,
        };
    }

    return { primary, secondary: null, hit };
}
