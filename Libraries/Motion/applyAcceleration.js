import { cardinalUnitVectorFromAngle } from "../Math/Angle.js";
import { wakePushableBody } from "./pushableSleep.js";
/**
 * Continuous world acceleration (units/s²) — same semantics as gravity pads and floor belts.
 * Not mass-weighted; use `applyImpulse` for instant knockback.
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
export function applyPushableAcceleration(body, ax, ay, dtSec) {
    if (!body || body.isDead || body.strategy?.gravityImmune) return;
    wakePushableBody(body);
    if (body.isSleeping) return;
    applyAcceleration(body, ax, ay, dtSec);
}
/**
 * @param {object} body
 * @param {number} angle — radians (cardinal-snapped for belts)
 * @param {number} magnitude — acceleration along facing (units/s²)
 * @param {number} dtSec
 */
export function applyPushableAccelerationAlongAngle(body, angle, magnitude, dtSec) {
    const { x, y } = cardinalUnitVectorFromAngle(angle);
    applyPushableAcceleration(body, x * magnitude, y * magnitude, dtSec);
}
