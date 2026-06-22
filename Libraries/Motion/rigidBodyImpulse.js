import { getCollisionSettings } from "../Collision/collisionDefaults.js";
import { dotXY } from "../Math/Vec2.js";
/**
 * Two-body impulse exchange at a SAT contact (kinetic prop pairs).
 */
/**
 * @param {{
 *   x: number, y: number,
 *   vx?: number, vy?: number,
 *   angularVelocity?: number,
 *   mass?: number, radius?: number,
 *   momentOfInertia?: number,
 * }} p1 — mutated in place
 * @param {typeof p1} p2 — mutated in place
 * @param {{ nx: number, ny: number, overlap: number, cx?: number, cy?: number }} collisionInfo
 * @param {number} [restitution]
 */
export function applyRigidBodyImpulse(p1, p2, collisionInfo, restitution = getCollisionSettings().restitution.rigidBody) {
    const nx = collisionInfo.nx;
    const ny = collisionInfo.ny;
    const cx = collisionInfo.cx !== undefined ? collisionInfo.cx : p1.x + nx * (collisionInfo.overlap / 2);
    const cy = collisionInfo.cy !== undefined ? collisionInfo.cy : p1.y + ny * (collisionInfo.overlap / 2);
    const rx1 = cx - p1.x;
    const ry1 = cy - p1.y;
    const rx2 = cx - p2.x;
    const ry2 = cy - p2.y;
    const w1 = p1.angularVelocity || 0;
    const w2 = p2.angularVelocity || 0;
    const v1x = (p1.vx || 0) - w1 * ry1;
    const v1y = (p1.vy || 0) + w1 * rx1;
    const v2x = (p2.vx || 0) - w2 * ry2;
    const v2y = (p2.vy || 0) + w2 * rx2;
    const rvx = v2x - v1x;
    const rvy = v2y - v1y;
    const velAlongNormal = dotXY(rvx, rvy, nx, ny);
    if (velAlongNormal >= 0) return;
    const m1 = p1.mass !== undefined ? p1.mass : p1.radius || 15;
    const m2 = p2.mass !== undefined ? p2.mass : p2.radius || 15;
    const invMass1 = 1 / m1;
    const invMass2 = 1 / m2;
    const invI1 = p1.momentOfInertia ? 1 / p1.momentOfInertia : 0;
    const invI2 = p2.momentOfInertia ? 1 / p2.momentOfInertia : 0;
    const cross1 = rx1 * ny - ry1 * nx;
    const cross2 = rx2 * ny - ry2 * nx;
    const denom = invMass1 + invMass2 + cross1 * cross1 * invI1 + cross2 * cross2 * invI2;
    const j = (-(1 + restitution) * velAlongNormal) / denom;
    if (p1.vx !== undefined) p1.vx -= j * nx * invMass1;
    if (p1.vy !== undefined) p1.vy -= j * ny * invMass1;
    if (p1.momentOfInertia) p1.angularVelocity -= j * cross1 * invI1;
    if (p2.vx !== undefined) p2.vx += j * nx * invMass2;
    if (p2.vy !== undefined) p2.vy += j * ny * invMass2;
    if (p2.momentOfInertia) p2.angularVelocity += j * cross2 * invI2;
}
