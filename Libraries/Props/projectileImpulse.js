import { wakePushableBody } from "../Motion/pushableSleep.js";
import { standTipFacingFromPush } from "./standTipMotion.js";
/**
 * @param {object} prop
 * @param {number} fx
 * @param {number} fy
 */
export function applyTipImpulseFromForce(prop, fx, fy) {
    if (!prop.strategy?.standTip || prop.isFallen) return;
    const force = Math.hypot(fx, fy);
    if (force < 1) return;
    prop.facing = standTipFacingFromPush(Math.atan2(fy, fx));
    const gain = prop.strategy.tipImpulseGain ?? 0.035;
    prop.rollOmega = (prop.rollOmega ?? 0) + (force * gain) / Math.max(prop.mass ?? 1, 0.4);
}
/**
 * Shared knockback for projectile / beam hits on pushable props.
 *
 * @param {object} prop
 * @param {object | null | undefined} projectile
 * @param {{
 *   pushForce?: number,
 *   explosionPushForce?: number,
 *   shardPushForce?: number,
 *   applyTorque?: boolean,
 *   wake?: boolean,
 * }} [options]
 */
export function applyProjectileImpulseToWorldProp(prop, projectile, { pushForce = 80, explosionPushForce = 250, shardPushForce = 120, applyTorque = true, wake = true } = {}) {
    if (!projectile) return;
    const isExplosion = Boolean(projectile.isExplosion);
    let force = pushForce;
    if (isExplosion) force = explosionPushForce;
    else if (prop.strategy?.splittable) force = shardPushForce;
    let forceAngle;
    if (isExplosion && projectile.x != null && projectile.y != null) forceAngle = Math.atan2(prop.y - projectile.y, prop.x - projectile.x);
    else if (projectile.angle != null) forceAngle = projectile.angle;
    else if (projectile.x != null && projectile.y != null) forceAngle = Math.atan2(prop.y - projectile.y, prop.x - projectile.x);
    else return;
    const fx = Math.cos(forceAngle) * force;
    const fy = Math.sin(forceAngle) * force;
    prop.vx = (prop.vx ?? 0) + fx;
    prop.vy = (prop.vy ?? 0) + fy;
    if (applyTorque && projectile.x != null && projectile.y != null && !isExplosion) {
        const rx = projectile.x - prop.x;
        const ry = projectile.y - prop.y;
        const torque = rx * fy - ry * fx;
        const invI = 1 / Math.max(prop.momentOfInertia ?? 1, 0.5);
        prop.angularVelocity = (prop.angularVelocity ?? 0) + torque * invI;
        if (prop.strategy?.standTip) {
            applyTipImpulseFromForce(prop, fx, fy);
            prop.angularVelocity = 0;
        }
    } else if (prop.strategy?.standTip) applyTipImpulseFromForce(prop, fx, fy);
    if (wake) wakePushableBody(prop);
}
