import { applyProjectileImpulseToWorldProp } from "./projectileImpulse.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { canSplittableWorldPropSplit } from "./splittable.js";
import { fractureSplittableOnImpact } from "./splittableWorldProp.js";
export function splittableOnHit(state, prop, projectile) {
    if (!canSplittableWorldPropSplit(prop)) {
        if (prop.ageMs > 250) return false;
        applyProjectileImpulseToWorldProp(prop, projectile);
        if (projectile?.isDead !== undefined) projectile.isDead = true;
        return true;
    }
    const fracture = fractureSplittableOnImpact(prop, projectile);
    if (fracture) {
        wakePushableBody(prop);
        prop.spawnSplittableFragments(state, fracture.debris, fracture);
    }
    applyProjectileImpulseToWorldProp(prop, projectile);
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return true;
}
export function impulseOnHit(_state, prop, projectile) {
    applyProjectileImpulseToWorldProp(prop, projectile, { pushForce: 110 });
    if (projectile?.isDead !== undefined) projectile.isDead = true;
    return Boolean(prop.strategy?.isPushable);
}
export const HIT_BEHAVIOR_HANDLERS = { none: impulseOnHit, splittable: splittableOnHit };
