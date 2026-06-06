import { mergePairFilter } from "./pairRules.js";
import { DENY_ALL_PAIR } from "./denyAllPair.js";
import {
    withSpatialPairResolvers,
    excludeDeadOther,
    excludeSameEntity,
    requirePushableOther,
    dedupPairById,
    requireActorPushableResolve,
    requirePushablePairResolve,
    sleepBlockerNeighborAny,
} from "./pairRuleClauses.js";
/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */
/** @typedef {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} InteractionPairsPort */
/** Actor–pushable SAT/circle resolution pairs. */
export const ACTOR_PUSHABLE_PAIR = /** @type {PairFilterConfig} */ (mergePairFilter(withSpatialPairResolvers, excludeDeadOther, requirePushableOther, requireActorPushableResolve));
/** Pushable–pushable resolution pairs (deduped; moving, rotating, or penetrating). */
export const PUSHABLE_PAIR = /** @type {PairFilterConfig} */ (
    mergePairFilter(withSpatialPairResolvers, excludeSameEntity, excludeDeadOther, requirePushableOther, dedupPairById, requirePushablePairResolve)
);
/** Neighbor can block pushable sleep (overlapping actor or pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));
/** @returns {InteractionPairsPort} */
export function createDefaultInteractionPairs() {
    return {
        separation: DENY_ALL_PAIR,
        actorPushable: ACTOR_PUSHABLE_PAIR,
        pushable: PUSHABLE_PAIR,
        pushableSleepBlocker: PUSHABLE_SLEEP_BLOCKER,
        combatant: DENY_ALL_PAIR,
        chargeImpact: DENY_ALL_PAIR,
        projectileHitActor: DENY_ALL_PAIR,
        projectileHitPickup: DENY_ALL_PAIR,
    };
}
