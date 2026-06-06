import { mergePairFilter } from "../../../Libraries/Interaction/pairRules.js";
import {
    excludeDeadOther,
    excludeDeadEither,
    excludePassiveEither,
    excludeSameTeam,
    excludeSameFaction,
    excludePushableOther,
    excludeActorOther,
    requireActorOther,
    requirePickupOnHit,
    dedupPairById,
} from "../../../Libraries/Interaction/pairRuleClauses.js";
import {
    withCombatResolvers,
    excludeUndefinedFactionOther,
    excludeChargeVsPlayer,
    includeCrossFactionHostile,
} from "./combatInteractionRules.js";

/** @typedef {import("../../../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */

export const COMBAT_HOSTILE_PAIR = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadEither, excludePassiveEither, excludeSameTeam, excludeSameFaction, includeCrossFactionHostile)
);

export const COMBAT_SEPARATION = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadOther, excludeUndefinedFactionOther, excludeSameTeam, excludeChargeVsPlayer, excludePushableOther)
);

export const CHARGE_IMPACT = COMBAT_HOSTILE_PAIR;

export const PROJECTILE_HIT_ACTOR = /** @type {PairFilterConfig} */ (mergePairFilter(COMBAT_HOSTILE_PAIR, requireActorOther));

export const COMBATANT_PAIR = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, requireActorOther, dedupPairById));

export const PROJECTILE_HIT_PICKUP = /** @type {PairFilterConfig} */ (mergePairFilter(excludeDeadOther, excludeActorOther, requirePickupOnHit));

/** Overrides on engine default physics pairs — tower adds faction/combat interactions. */
export const towerCombatInteraction = {
    separation: COMBAT_SEPARATION,
    chargeImpact: CHARGE_IMPACT,
    projectileHitActor: PROJECTILE_HIT_ACTOR,
    projectileHitPickup: PROJECTILE_HIT_PICKUP,
    combatant: COMBATANT_PAIR,
};
