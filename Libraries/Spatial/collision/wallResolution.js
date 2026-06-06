import { getCircleSegmentPenetration } from "../geometry/WallGeometry.js";
import { applyStaticSurfaceImpulse } from "../../Motion/staticSurfaceImpulse.js";
import { SatCollision } from "./SatCollision.js";
import { PolygonShape } from "./Shapes.js";
import { applyPositionCorrection, computeCircleWallContact, computePolygonWallContact } from "./penetration.js";
/**
 * @typedef {object} WallHit
 * @property {number} approachDot — velocity along push-out normal before impulse (negative = approaching)
 * @property {number} normalX
 * @property {number} normalY
 * @property {object} segment
 */
/**
 * Lazy AABB polygon for oriented wall segments used in SAT tests.
 * @param {{ size: number, shape?: import("./Shapes.js").PolygonShape }} segment — mutated
 */
export function ensureWallSegmentPolygonShape(segment) {
    if (!segment.shape) {
        const half = segment.size / 2;
        segment.shape = new PolygonShape([
            { x: -half, y: -half },
            { x: half, y: -half },
            { x: half, y: half },
            { x: -half, y: half },
        ]);
    }
    return segment.shape;
}
/**
 * Two-pass wall resolution: penetration push-out + static-surface impulse per segment.
 * @param {{ x: number, y: number, radius?: number, vx?: number, vy?: number }} body — mutated
 * @param {import("./Shapes.js").CircleShape | import("./Shapes.js").PolygonShape} shape
 * @param {object[]} segments
 * @param {{ restitution?: number, friction?: number, passes?: number }} [options]
 * @returns {{ collided: boolean, hits: WallHit[] }}
 */
export function resolveBodyAgainstWallSegments(body, shape, segments, { restitution = 0, friction = 0.9, passes = 2 } = {}) {
    let collided = false;
    const hits = [];
    const radius = shape.getBoundingRadius();
    for (let pass = 0; pass < passes; pass++) {
        let best = null;
        for (const seg of segments) {
            if (seg.isDead) continue;
            const maxDist = radius + seg.size * 0.75;
            if (Math.abs(body.x - seg.x) > maxDist || Math.abs(body.y - seg.y) > maxDist) continue;
            let normalX;
            let normalY;
            let overlap;
            let satResult = null;
            if (shape.type === "Circle") {
                const penetration = getCircleSegmentPenetration(body, seg, { approachX: body.vx ?? 0, approachY: body.vy ?? 0 });
                if (!penetration) continue;
                normalX = penetration.normalX;
                normalY = penetration.normalY;
                overlap = penetration.overlap;
            } else if (shape.type === "Polygon") {
                const segShape = ensureWallSegmentPolygonShape(seg);
                satResult = SatCollision.checkCollision(body, shape, seg, segShape);
                if (!satResult) continue;
                normalX = -satResult.nx;
                normalY = -satResult.ny;
                overlap = satResult.overlap;
            } else continue;
            if (!best || overlap > best.overlap) best = { normalX, normalY, overlap, satResult, segment: seg };
        }
        if (!best) break;
        collided = true;
        applyPositionCorrection(body, best.normalX, best.normalY, best.overlap);
        const contact =
            shape.type === "Circle"
                ? computeCircleWallContact(body, best.normalX, best.normalY, body.radius)
                : computePolygonWallContact(body, best.normalX, best.normalY, best.overlap, best.satResult);
        const { approachDot } = applyStaticSurfaceImpulse(body, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
        hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment });
    }
    return { collided, hits };
}
