import { mergePairFilter } from "./pairRules.js";
import { DENY_ALL_PAIR } from "./denyAllPair.js";
import { excludeDeadOther, sleepBlockerNeighborAny } from "./pairRuleClauses.js";
/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */
/** @typedef {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** Neighbor can block pushable sleep (overlapping pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));
/** @returns {InteractionPairsPort} */
export function createDefaultInteractionPairs() {
    return { pushableSleepBlocker: PUSHABLE_SLEEP_BLOCKER, projectileHitActor: DENY_ALL_PAIR, projectileHitWorldProp: DENY_ALL_PAIR };
}
