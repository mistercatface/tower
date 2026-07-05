import { cardinalUnitVectorFromAngle } from "../Math/Angle.js";
import { wakeKineticBody } from "./kineticPhysicsPass.js";
import { addXY, lengthXY, dotXY } from "../Math/Vec2.js";
import { collisionSettings } from "./physicsDefaults.js";
// --- MERGED FROM motionDynamics.js ---
/**
 * Continuous world acceleration (units/s²) — same semantics as floor belts.
 * Not mass-weighted; instant velocity changes use direct vx/vy writes at contact sites.
 *
 * @param {{ vx?: number, vy?: number }} body
 * @param {number} ax
 * @param {number} ay
 * @param {number} dtSec
 */
export function applyAcceleration(body, ax, ay, dtSec) {
    if (body.vx === undefined || body.vy === undefined) return;
    body.vx += ax * dtSec;
    body.vy += ay * dtSec;
}
/**
 * @param {object} body
 * @param {number} ax
 * @param {number} ay
 * @param {number} dtSec
 */
export function applyKineticAcceleration(body, ax, ay, dtSec) {
    if (body.ax === undefined || body.ay === undefined) return;
    body.ax += ax;
    body.ay += ay;
    wakeKineticBody(body);
}
/**
 * @param {object} body
 * @param {number} angle — radians (cardinal-snapped for belts)
 * @param {number} magnitude — acceleration along facing (units/s²)
 * @param {number} dtSec
 */
export function applyKineticAccelerationAlongAngle(body, angle, magnitude, dtSec) {
    const { x, y } = cardinalUnitVectorFromAngle(angle);
    applyKineticAcceleration(body, x * magnitude, y * magnitude, dtSec);
}
/**
 * Velocity and angular drag for coasting / knockback decay (top-down locomotion).
 */
/**
 * @typedef {object} DampedBody
 * @property {number} x
 * @property {number} y
 * @property {number} [vx]
 * @property {number} [vy]
 * @property {number} [facing]
 * @property {number} [angularVelocity]
 */
/**
 * @param {DampedBody} body — mutated in place
 * @param {number} dtMs
 * @param {{ friction?: number, integrateFacing?: boolean, snapSpeed?: number }} [options]
 */
export function applyVelocityDamping(body, dtMs, { friction = 8.0, integrateFacing = true, snapSpeed = 1 } = {}) {
    if (body.ax || body.ay) {
        body.vx = (body.vx ?? 0) + body.ax * (dtMs / 1000);
        body.vy = (body.vy ?? 0) + body.ay * (dtMs / 1000);
    }
    if (body.vx || body.vy) {
        addXY(body, (body.vx ?? 0) * (dtMs / 1000), (body.vy ?? 0) * (dtMs / 1000));
        const dragFactor = Math.exp(-friction * (dtMs / 1000));
        body.vx = (body.vx ?? 0) * dragFactor;
        body.vy = (body.vy ?? 0) * dragFactor;
        if (lengthXY(body.vx, body.vy) < snapSpeed) {
            body.vx = 0;
            body.vy = 0;
        }
    }
    if (integrateFacing && body.angularVelocity) {
        body.facing = (body.facing ?? 0) + body.angularVelocity * (dtMs / 1000);
        const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
        body.angularVelocity *= angularDrag;
        if (Math.abs(body.angularVelocity) < 0.1) body.angularVelocity = 0;
    }
}
/**
 * Two-body impulse exchange at a SAT contact (kinetic prop pairs).
 *
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
export function applyRigidBodyImpulse(p1, p2, collisionInfo, restitution = collisionSettings.restitution.rigidBody) {
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
