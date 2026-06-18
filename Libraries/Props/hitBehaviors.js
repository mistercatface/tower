import { applyProjectileImpulseToWorldProp } from "./projectileImpulse.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { canSplittableWorldPropSplit } from "./splittable.js";
import { fractureSplittableOnImpact } from "./splittableWorldProp.js";
/**
 * @param {object} state
 * @param {object} prop
 * @param {object | null | undefined} projectile
 */
export function damageOnHit(state, prop, projectile) {
    if (prop.strategy.splittable)
        if (!canSplittableWorldPropSplit(prop)) {
            if (prop.ageMs > 250) return false;
            applyProjectileImpulseToWorldProp(prop, projectile);
            if (projectile?.isDead !== undefined) projectile.isDead = true;
            return true;
        } else {
            const fracture = fractureSplittableOnImpact(prop, projectile);
            if (fracture) {
                wakePushableBody(prop);
                prop.spawnSplittableFragments(state, fracture.debris, fracture);
            }
        }
    const dmg = projectile?.damage ?? 0;
    prop.takeDamage(dmg, state);
    if (prop.health > 0) applyProjectileImpulseToWorldProp(prop, projectile);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}
/**
 * Push-only props (log, beach ball): knockback without damage.
 *
 * @param {object} _state
 * @param {object} prop
 * @param {object | null | undefined} projectile
 */
export function impulseOnHit(_state, prop, projectile) {
    applyProjectileImpulseToWorldProp(prop, projectile, { pushForce: 110 });
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return Boolean(prop.strategy?.isPushable);
}
/** @type {Record<string, (state: object, prop: object, projectile: object) => boolean>} */
export const HIT_BEHAVIOR_HANDLERS = { none: impulseOnHit, damage: damageOnHit };
