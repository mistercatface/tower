import { gatherKineticContactPairs, resolveKineticContactPassWithPairs } from "../../Libraries/Spatial/collision/kineticContactSolver.js";

/** Single-shot contact resolve for tests (gather once, solve once). */
export function resolveKineticContactPass(tick) {
    const pairs = gatherKineticContactPairs(tick);
    resolveKineticContactPassWithPairs(tick, pairs);
}
