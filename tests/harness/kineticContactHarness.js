import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, checkEntityPairCollisionAtSlabPose } from "../../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../../Core/engineMemory.js";
import { writebackActiveKineticBodySlab } from "../../Libraries/Physics/physics.js";

export function checkPairAtSlabPose(bodyA, bodyB) {
    const slab = kineticDynamicSlab;
    return checkEntityPairCollisionAtSlabPose(bodyA, bodyB, bodyA._physId, bodyB._physId, slab.x[bodyA._physId], slab.y[bodyA._physId], slab.x[bodyB._physId], slab.y[bodyB._physId]);
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
