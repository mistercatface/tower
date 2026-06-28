import { getCircleSegmentPenetration } from "../geometry/WallGeometry.js";
import { resolvePassageWallContact } from "../../Spatial/grid/passageWallContact.js";
import { SatCollision, entityFacing, SAT_RESULT } from "./SatCollision.js";
import { PolygonShape } from "./Shapes.js";
import { applyPositionCorrection, computeCircleWallContact, computePolygonWallContact } from "./penetration.js";
import { kineticDynamicSlab, kineticStaticSlab } from "./kineticBodySlab.js";
import { inverseMassFromBody } from "../../Motion/bodyMass.js";
import { dotXY } from "../../Math/Vec2.js";
/**
 * Impulse + friction against a static surface (wall). Mutates velocity in place.
 *
 * @param {{
 *   x: number, y: number,
 *   vx?: number, vy?: number,
 *   angularVelocity?: number,
 *   mass?: number, radius?: number,
 *   momentOfInertia?: number,
 *   _physId?: number,
 * }} body
 * @param {number} normalX — push-out normal (away from wall into free space)
 * @param {number} normalY
 * @param {number} cx — contact point world x
 * @param {number} cy
 * @param {{ restitution?: number, friction?: number }} [options]
 * @returns {number}
 */
export function applyStaticSurfaceImpulse(body, normalX, normalY, cx, cy, { restitution = 0, friction = 0.9 } = {}) {
    const physId = body._physId;
    const hasSlab = physId !== undefined && physId !== -1;
    const bx = hasSlab ? kineticDynamicSlab.x[physId] : body.x;
    const by = hasSlab ? kineticDynamicSlab.y[physId] : body.y;
    const bvx = hasSlab ? kineticDynamicSlab.vx[physId] : body.vx;
    const bvy = hasSlab ? kineticDynamicSlab.vy[physId] : body.vy;
    const bw = hasSlab ? kineticDynamicSlab.w[physId] : body.angularVelocity;
    if (bvx === undefined || bvy === undefined) return 0;
    const rx = cx - bx;
    const ry = cy - by;
    const w = bw || 0;
    const vpx = bvx - w * ry;
    const vpy = bvy + w * rx;
    const approachDot = dotXY(vpx, vpy, normalX, normalY);
    if (approachDot >= 0) return approachDot;
    const invMassVal = hasSlab ? kineticStaticSlab.invMass[physId] : inverseMassFromBody(body);
    const invI = hasSlab ? kineticStaticSlab.invI[physId] : body.momentOfInertia ? 1 / body.momentOfInertia : 0;
    const hasMoment = hasSlab ? kineticStaticSlab.invI[physId] > 0 : !!body.momentOfInertia;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    let newVx = bvx + j * normalX * invMassVal;
    let newVy = bvy + j * normalY * invMassVal;
    let newW = bw;
    if (hasMoment) newW = (bw || 0) + j * cross * invI;
    const tx = -normalY;
    const ty = normalX;
    const vpxNew = newVx - newW * ry;
    const vpyNew = newVy + newW * rx;
    const tangentDot = dotXY(vpxNew, vpyNew, tx, ty);
    const crossT = rx * ty - ry * tx;
    const denomT = invMassVal + crossT * crossT * invI;
    const jt = (-tangentDot * (1 - friction)) / denomT;
    newVx += jt * tx * invMassVal;
    newVy += jt * ty * invMassVal;
    if (hasMoment) newW += jt * crossT * invI;
    if (hasSlab) {
        kineticDynamicSlab.vx[physId] = newVx;
        kineticDynamicSlab.vy[physId] = newVy;
        kineticDynamicSlab.w[physId] = newW;
    } else {
        body.vx = newVx;
        body.vy = newVy;
        if (body.momentOfInertia) body.angularVelocity = newW;
    }
    return approachDot;
}
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
        segment.shape = new PolygonShape(new Float32Array([-halfX, -halfY, halfX, -halfY, halfX, halfY, -halfX, halfY]));
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
        hits.push({ approachDot, normalX: best.normalX, normalY: best.normalY, segment: best.segment, overlap: best.overlap, contactX: contact.cx, contactY: contact.cy });
    }
    return { collided, hits };
}
