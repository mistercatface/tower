import { processKineticContactFractures } from "../../Libraries/Props/props.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer, checkEntityPairCollision, kineticDynamicSlab } from "../../Libraries/Physics/physics.js";
import { writebackActiveKineticBodySlab } from "../../Libraries/Physics/physics.js";

export function checkPairAtSlabPose(bodyA, bodyB) {
    const slab = kineticDynamicSlab;
    return checkEntityPairCollision(bodyA, bodyB, slab.x[bodyA._physId], slab.y[bodyA._physId], slab.x[bodyB._physId], slab.y[bodyB._physId]);
}

/** Single-shot contact resolve for tests (gather once, solve once). */
export function resolveKineticContactPass(tick) {
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
    writebackActiveKineticBodySlab(tick.frame._activeKineticBodies);
}

/** Single-shot contact resolve plus fracture side effects (tests only). */
export function resolveKineticContactPassWithEffects(tick) {
    resolveKineticContactPass(tick);
    processKineticContactFractures(tick, kineticContactBuffer);
}
