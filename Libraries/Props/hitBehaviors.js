import { applyProjectileImpulseToPickup } from "./projectileImpulse.js";
import { canSplittablePickupSplit } from "./splittable.js";
/**
 * @param {object} state
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 */
export function damageOnHit(state, pickup, projectile) {
    if (pickup.strategy.splittable)
        if (!canSplittablePickupSplit(pickup)) {
            if (pickup.ageMs > 250) return false;
            applyProjectileImpulseToPickup(pickup, projectile);
            if (projectile?.isDead !== undefined) projectile.isDead = true;
            return true;
        }
    const dmg = projectile?.damage ?? 0;
    pickup.takeDamage(dmg, state);
    if (pickup.health > 0) applyProjectileImpulseToPickup(pickup, projectile);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}
/**
 * Push-only props (log, beach ball): knockback without damage.
 *
 * @param {object} _state
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 */
export function impulseOnHit(_state, pickup, projectile) {
    applyProjectileImpulseToPickup(pickup, projectile, { pushForce: 110 });
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return Boolean(pickup.strategy?.isPushable);
}
/** @type {Record<string, (state: object, pickup: object, projectile: object) => boolean>} */
export const HIT_BEHAVIOR_HANDLERS = { none: impulseOnHit, damage: damageOnHit };
