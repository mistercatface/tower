import { applyKineticContactSideEffects } from "../../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { gatherKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer } from "../../Libraries/Spatial/collision/kineticContactSolver.js";

/** Single-shot contact resolve for tests (gather once, solve once). */
export function resolveKineticContactPass(tick) {
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
}

/** Single-shot contact resolve plus fracture side effects (tests only). */
export function resolveKineticContactPassWithEffects(tick) {
    resolveKineticContactPass(tick);
    applyKineticContactSideEffects(tick, kineticContactBuffer);
}
