import { mergePairFilter } from "./pairRules.js";
import { DENY_ALL_PAIR } from "./denyAllPair.js";
import { withSpatialPairResolvers, excludeDeadOther, excludeSameEntity, requirePushableOther, dedupPairById, requirePushablePairResolve, sleepBlockerNeighborAny } from "./pairRuleClauses.js";
/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */
/** @typedef {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** Pushable–pushable resolution pairs (deduped; moving, rotating, or penetrating). */
export const PUSHABLE_PAIR = /** @type {PairFilterConfig} */ (
    mergePairFilter(withSpatialPairResolvers, excludeSameEntity, excludeDeadOther, requirePushableOther, dedupPairById, requirePushablePairResolve)
);
/** Neighbor can block pushable sleep (overlapping actor or pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));
/** @returns {InteractionPairsPort} */
export function createDefaultInteractionPairs() {
    return { separation: DENY_ALL_PAIR, pushable: PUSHABLE_PAIR, pushableSleepBlocker: PUSHABLE_SLEEP_BLOCKER, projectileHitActor: DENY_ALL_PAIR, projectileHitWorldProp: DENY_ALL_PAIR };
}
