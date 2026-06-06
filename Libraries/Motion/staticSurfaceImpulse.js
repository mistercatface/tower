import { inverseMassFromBody } from "./bodyMass.js";
/**
 * Impulse + friction against a static surface (wall). Mutates velocity in place.
 *
 * @param {{
 *   x: number, y: number,
 *   vx?: number, vy?: number,
 *   angularVelocity?: number,
 *   mass?: number, radius?: number,
 *   momentOfInertia?: number,
 * }} body
 * @param {number} normalX — push-out normal (away from wall into free space)
 * @param {number} normalY
 * @param {number} cx — contact point world x
 * @param {number} cy
 * @param {{ restitution?: number, friction?: number }} [options]
 * @returns {{ approachDot: number, applied: boolean }}
 */
export function applyStaticSurfaceImpulse(body, normalX, normalY, cx, cy, { restitution = 0, friction = 0.9 } = {}) {
    if (body.vx === undefined || body.vy === undefined) return { approachDot: 0, applied: false };
    const rx = cx - body.x;
    const ry = cy - body.y;
    const w = body.angularVelocity || 0;
    const vpx = body.vx - w * ry;
    const vpy = body.vy + w * rx;
    const approachDot = vpx * normalX + vpy * normalY;
    if (approachDot >= 0) return { approachDot, applied: false };
    const invMassVal = inverseMassFromBody(body);
    const invI = body.momentOfInertia ? 1 / body.momentOfInertia : 0;
    const cross = rx * normalY - ry * normalX;
    const denom = invMassVal + cross * cross * invI;
    const j = (-(1 + restitution) * approachDot) / denom;
    body.vx += j * normalX * invMassVal;
    body.vy += j * normalY * invMassVal;
    if (body.momentOfInertia) body.angularVelocity = (body.angularVelocity || 0) + j * cross * invI;
    const tx = -normalY;
    const ty = normalX;
    const wNew = body.angularVelocity || 0;
    const vpxNew = body.vx - wNew * ry;
    const vpyNew = body.vy + wNew * rx;
    const tangentDot = vpxNew * tx + vpyNew * ty;
    const crossT = rx * ty - ry * tx;
    const denomT = invMassVal + crossT * crossT * invI;
    const jt = (-tangentDot * (1 - friction)) / denomT;
    body.vx += jt * tx * invMassVal;
    body.vy += jt * ty * invMassVal;
    if (body.momentOfInertia) body.angularVelocity += jt * crossT * invI;
    return { approachDot, applied: true };
}
