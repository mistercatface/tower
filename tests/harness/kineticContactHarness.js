import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, checkEntityPairCollision, kineticDynamicSlab } from "../../Libraries/Physics/physics.js";
import { writebackActiveKineticBodySlab } from "../../Libraries/Physics/physics.js";

export function checkPairAtSlabPose(bodyA, bodyB) {
    const slab = kineticDynamicSlab;
    return checkEntityPairCollision(bodyA, bodyB, slab.x[bodyA._physId], slab.y[bodyA._physId], slab.x[bodyB._physId], slab.y[bodyB._physId]);
}

/** Single-shot contact resolve for tests (gather once, solve once). */
export function resolveKineticContactPass(tick) {
    const pairs = gatherKineticContactPairs(tick);
    const contacts = resolveKineticContactPassWithPairs(tick, pairs);
    writebackActiveKineticBodySlab(tick.frame._activeKineticBodies);
    return contacts;
}

/** Single-shot contact resolve plus fracture side effects (tests only). */
export function resolveKineticContactPassWithEffects(tick) {
    const contacts = resolveKineticContactPass(tick);
    tick.world.fractureEngine.processKineticContactFractures(tick, contacts);
}
