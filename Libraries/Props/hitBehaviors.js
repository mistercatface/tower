import { getProjectileDamage } from "../../Combat/impactDamage.js";
import { applyProjectileImpulseToPickup } from "./projectileImpulse.js";

/**
 * @param {object} state
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 */
export function explosiveOnHit(state, pickup, projectile) {
    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }
    const dmg = projectile ? getProjectileDamage(projectile) : 0;
    pickup.takeDamage(dmg, state);
    if (pickup.health > 0) {
        applyProjectileImpulseToPickup(pickup, projectile, { pushForce: 95 });
    }
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

/**
 * @param {object} state
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 */
export function damageOnHit(state, pickup, projectile) {
    if (pickup.strategy.splittable) {
        const width = pickup.halfExtents ? pickup.halfExtents.x * 2 : pickup.radius * 2;
        const height = pickup.halfExtents ? pickup.halfExtents.y * 2 : pickup.radius * 2;
        const minSize = 3;
        const canSplit = width >= minSize * 2 && height >= minSize * 2;

        if (!canSplit) {
            if (pickup.ageMs > 250) return false;
            applyProjectileImpulseToPickup(pickup, projectile);
            if (projectile?.isDead !== undefined) projectile.isDead = true;
            return true;
        }
    }

    if (projectile?.isExplosion) {
        pickup.explode(state);
        return true;
    }

    const dmg = projectile?.damage ?? 0;
    pickup.takeDamage(dmg, state);

    if (pickup.health > 0) {
        applyProjectileImpulseToPickup(pickup, projectile);
    }

    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}

/**
 * Push-only props (log, beach ball): knockback without damage/explode logic.
 *
 * @param {object} _state
 * @param {object} pickup
 * @param {object | null | undefined} projectile
 */
export function impulseOnHit(_state, pickup, projectile) {
    if (projectile?.isExplosion) return false;
    applyProjectileImpulseToPickup(pickup, projectile, { pushForce: 110 });
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return Boolean(pickup.strategy?.isPushable);
}

/** @type {Record<string, (state: object, pickup: object, projectile: object) => boolean>} */
export const HIT_BEHAVIOR_HANDLERS = {
    none: impulseOnHit,
    explosive: explosiveOnHit,
    damage: damageOnHit,
};
