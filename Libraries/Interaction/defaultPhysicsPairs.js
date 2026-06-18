import { mergePairFilter } from "./pairRules.js";
import { excludeDeadOther, sleepBlockerNeighborAny } from "./pairRuleClauses.js";
/** Neighbor can block kinetic sleep (overlapping kinetic body). */
export const KINETIC_SLEEP_BLOCKER = /** @type {import("./pairRules.js").PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));
/** @returns {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} */
export function createDefaultInteractionPairs() {
    return { kineticSleepBlocker: KINETIC_SLEEP_BLOCKER };
}
