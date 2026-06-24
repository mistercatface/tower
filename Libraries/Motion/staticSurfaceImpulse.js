import { inverseMassFromBody } from "./bodyMass.js";
import { dotXY } from "../Math/Vec2.js";
import { kineticDynamicSlab, kineticStaticSlab } from "../Spatial/collision/kineticBodySlab.js";
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
