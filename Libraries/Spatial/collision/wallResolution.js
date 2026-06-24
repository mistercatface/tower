import { getCircleSegmentPenetration } from "../geometry/WallGeometry.js";
import { applyStaticSurfaceImpulse } from "../../Motion/staticSurfaceImpulse.js";
import { resolvePassageWallContact } from "../../Spatial/grid/passageWallContact.js";
import { SatCollision, entityFacing, SAT_RESULT } from "./SatCollision.js";
import { PolygonShape } from "./Shapes.js";
import { applyPositionCorrection, computeCircleWallContact, computePolygonWallContact } from "./penetration.js";
import { kineticDynamicSlab } from "./kineticBodySlab.js";
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
        const halfX = segment.width !== undefined ? segment.width / 2 : segment.size / 2;
        const halfY = segment.height !== undefined ? segment.height / 2 : segment.size / 2;
        segment.shape = new PolygonShape([
            { x: -halfX, y: -halfY },
            { x: halfX, y: -halfY },
            { x: halfX, y: halfY },
            { x: -halfX, y: halfY },
        ]);
    }
    return segment.shape;
}
/**
 * Two-pass wall resolution: penetration push-out + static-surface impulse per segment.
 * @param {{ x: number, y: number, radius?: number, vx?: number, vy?: number, _frameDispX?: number, _frameDispY?: number, _physId?: number }} body — mutated
 * @param {import("./Shapes.js").CircleShape | import("./Shapes.js").PolygonShape} shape
 * @param {object[]} segments
 * @param {{ restitution?: number, friction?: number, passes?: number }} [options]
 * @returns {{ collided: boolean, hits: WallHit[] }}
 */
export function resolveBodyAgainstWallSegments(body, shape, segments, { restitution = 0, friction = 0.9, passes = 2 } = {}) {
    const physId = body._physId;
    const hasSlab = physId !== undefined && physId !== -1;
    const dispX = body._frameDispX;
    const dispY = body._frameDispY;
    let collided = false;
    const hits = [];
    const radius = shape.getBoundingRadius();
    for (let pass = 0; pass < passes; pass++) {
        let best = null;
        for (const seg of segments) {
            if (seg.passageEdge) {
                const edge = seg.passageEdge;
                const outcome = resolvePassageWallContact({
                    entity: body,
                    segment: seg,
                    edge,
                    ownerCol: seg.gridCol,
                    ownerRow: seg.gridRow,
                    ownerSide: seg.gridSide,
                    bodyRadius: radius,
                    vx: hasSlab ? kineticDynamicSlab.vx[physId] : (body.vx ?? 0),
                    vy: hasSlab ? kineticDynamicSlab.vy[physId] : (body.vy ?? 0),
                    dispX,
                    dispY,
                    grid: seg._obstacleGrid,
                });
                if (outcome === "consumed" || outcome === "skip") continue;
            }
            const maxDist = radius + seg.size * 0.75;
            const bx = hasSlab ? kineticDynamicSlab.x[physId] : body.x;
            const by = hasSlab ? kineticDynamicSlab.y[physId] : body.y;
            if (Math.abs(bx - seg.x) > maxDist || Math.abs(by - seg.y) > maxDist) continue;
            let normalX;
            let normalY;
            let overlap;
            let satCollisionFound = false;
            if (shape.type === "Circle") {
                const penetration = getCircleSegmentPenetration({ x: bx, y: by, radius: shape.radius }, seg, {
                    approachX: hasSlab ? kineticDynamicSlab.vx[physId] : (body.vx ?? 0),
                    approachY: hasSlab ? kineticDynamicSlab.vy[physId] : (body.vy ?? 0),
                });
                if (!penetration) continue;
                normalX = penetration.normalX;
                normalY = penetration.normalY;
                overlap = penetration.overlap;
            } else if (shape.type === "Polygon") {
                const segShape = ensureWallSegmentPolygonShape(seg);
                if (!SatCollision.checkCollision(bx, by, entityFacing(body), shape, seg.x, seg.y, entityFacing(seg), segShape)) continue;
                normalX = -SAT_RESULT[1];
                normalY = -SAT_RESULT[2];
                overlap = SAT_RESULT[0];
                satCollisionFound = true;
            } else continue;
            if (!best || overlap > best.overlap) best = { normalX, normalY, overlap, cx: satCollisionFound ? SAT_RESULT[3] : NaN, cy: satCollisionFound ? SAT_RESULT[4] : NaN, segment: seg };
        }
        if (!best) break;
        collided = true;
        applyPositionCorrection(body, best.normalX, best.normalY, best.overlap);
        const bx = hasSlab ? kineticDynamicSlab.x[physId] : body.x;
        const by = hasSlab ? kineticDynamicSlab.y[physId] : body.y;
        const contact =
            shape.type === "Circle"
                ? computeCircleWallContact({ x: bx, y: by }, best.normalX, best.normalY, shape.radius)
                : computePolygonWallContact({ x: bx, y: by }, best.normalX, best.normalY, best.overlap, best.cx, best.cy);
        const approachDot = applyStaticSurfaceImpulse(body, best.normalX, best.normalY, contact.cx, contact.cy, { restitution, friction });
        hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap });
    }
    return { collided, hits };
}
