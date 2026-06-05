import { mergePairFilter } from "../pairRules.js";
import {
    withCombatResolvers,
    withSpatialPairResolvers,
    excludeDeadOther,
    excludeDeadEither,
    excludePassiveEither,
    excludeSameTeam,
    excludeSameFaction,
    excludeUndefinedFactionOther,
    excludeChargeVsPlayer,
    excludePushableOther,
    excludeActorOther,
    excludeSameEntity,
    includeCrossFactionHostile,
    requireActorOther,
    requirePushableOther,
    requirePickupOnHit,
    dedupPairById,
    requireActorPushableResolve,
    requirePairActive,
    sleepBlockerNeighborAny,
} from "./combatRules.js";

/** @typedef {import("../pairRules.js").PairFilterConfig} PairFilterConfig */

/** Hostile combatant pair (matches areHostile). */
export const COMBAT_HOSTILE_PAIR = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadEither, excludePassiveEither, excludeSameTeam, excludeSameFaction, includeCrossFactionHostile)
);

/** Locomotion separation between combatants (default SeparationEngine preset). */
export const COMBAT_SEPARATION = /** @type {PairFilterConfig} */ (mergePairFilter(withCombatResolvers, excludeDeadOther, excludeUndefinedFactionOther, excludeSameTeam, excludeChargeVsPlayer, excludePushableOther));

/** Charge impact applies damage on hostile contact. */
export const CHARGE_IMPACT = COMBAT_HOSTILE_PAIR;

/** Projectile may hit hostile actors. */
export const PROJECTILE_HIT_ACTOR = /** @type {PairFilterConfig} */ (mergePairFilter(COMBAT_HOSTILE_PAIR, requireActorOther));

/** Combatant–combatant collision pairs (deduped, actors only). */
export const COMBATANT_PAIR = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, requireActorOther, dedupPairById));

/** Neighbor can block pushable sleep (overlapping actor or pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, sleepBlockerNeighborAny));

/** Actor–pushable SAT/circle resolution pairs. */
export const ACTOR_PUSHABLE_PAIR = /** @type {PairFilterConfig} */ (mergePairFilter(withSpatialPairResolvers, excludeDeadOther, requirePushableOther, requireActorPushableResolve));

/** Pushable–pushable resolution pairs (deduped, at least one moving). */
export const PUSHABLE_PAIR = /** @type {PairFilterConfig} */ (mergePairFilter(withSpatialPairResolvers, excludeSameEntity, excludeDeadOther, requirePushableOther, dedupPairById, requirePairActive));

/** Projectile may hit damageable pickups (not actors). */
export const PROJECTILE_HIT_PICKUP = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, excludeActorOther, requirePickupOnHit));
