import { wakePushableBody } from "../Motion/pushableSleep.js";
import { standTipFacingFromPush } from "./standTipMotion.js";
/**
 * @param {object} pickup
 * @param {number} fx
 * @param {number} fy
 */
export function applyTipImpulseFromForce(pickup, fx, fy) {
    if (!pickup.strategy?.standTip || pickup.isFallen) return;
    const force = Math.hypot(fx, fy);
    if (force < 1) return;
    pickup.facing = standTipFacingFromPush(Math.atan2(fy, fx));
    const gain = pickup.strategy.tipImpulseGain ?? 0.035;
    pickup.rollOmega = (pickup.rollOmega ?? 0) + (force * gain) / Math.max(pickup.mass ?? 1, 0.4);
}
/**
 * Shared knockback for projectile / beam hits on pushable props.
 *
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 * @param {{
 *   pushForce?: number,
 *   explosionPushForce?: number,
 *   shardPushForce?: number,
 *   applyTorque?: boolean,
 *   wake?: boolean,
 * }} [options]
 */
export function applyProjectileImpulseToPickup(pickup, projectile, { pushForce = 80, explosionPushForce = 250, shardPushForce = 120, applyTorque = true, wake = true } = {}) {
    if (!projectile) return;
    const isExplosion = Boolean(projectile.isExplosion);
    let force = pushForce;
    if (isExplosion) force = explosionPushForce;
    else if (pickup.strategy?.splittable) force = shardPushForce;
    let forceAngle;
    if (isExplosion && projectile.x != null && projectile.y != null) forceAngle = Math.atan2(pickup.y - projectile.y, pickup.x - projectile.x);
    else if (projectile.angle != null) forceAngle = projectile.angle;
    else if (projectile.x != null && projectile.y != null) forceAngle = Math.atan2(pickup.y - projectile.y, pickup.x - projectile.x);
    else return;
    const fx = Math.cos(forceAngle) * force;
    const fy = Math.sin(forceAngle) * force;
    pickup.vx = (pickup.vx ?? 0) + fx;
    pickup.vy = (pickup.vy ?? 0) + fy;
    if (applyTorque && projectile.x != null && projectile.y != null && !isExplosion) {
        const rx = projectile.x - pickup.x;
        const ry = projectile.y - pickup.y;
        const torque = rx * fy - ry * fx;
        const invI = 1 / Math.max(pickup.momentOfInertia ?? 1, 0.5);
        pickup.angularVelocity = (pickup.angularVelocity ?? 0) + torque * invI;
        if (pickup.strategy?.standTip) {
            applyTipImpulseFromForce(pickup, fx, fy);
            pickup.angularVelocity = 0;
        }
    } else if (pickup.strategy?.standTip) applyTipImpulseFromForce(pickup, fx, fy);
    if (wake) wakePushableBody(pickup);
}
