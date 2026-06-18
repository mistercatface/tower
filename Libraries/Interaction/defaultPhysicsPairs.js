import { mergePairFilter } from "./pairRules.js";
import { excludeDeadOther, sleepBlockerNeighborAny } from "./pairRuleClauses.js";
/** Neighbor can block pushable sleep (overlapping pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {import("./pairRules.js").PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));
/** @returns {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} */
export function createDefaultInteractionPairs() {
    return { pushableSleepBlocker: PUSHABLE_SLEEP_BLOCKER };
}
