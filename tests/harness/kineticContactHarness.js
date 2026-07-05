import { processKineticContactFractures } from "../../Libraries/Props/props.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer } from "../../Libraries/Physics/physics.js";
import { writebackActiveKineticBodySlab } from "../../Libraries/Physics/physics.js";

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
