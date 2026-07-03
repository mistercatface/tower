import { cardinalUnitVectorFromAngle } from "../Math/Angle.js";
import { wakeKineticBody } from "./kineticSleep.js";
import { addXY, lengthXY } from "../Math/Vec2.js";

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
    if (!body) return;
    wakeKineticBody(body);
    applyAcceleration(body, ax, ay, dtSec);
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
