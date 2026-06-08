import { mergePairFilter } from "../Interaction/pairRules.js";
import {
    excludeDeadOther,
    excludeDeadEither,
    excludePassiveEither,
    excludeSameTeam,
    excludeSameFaction,
    excludePushableOther,
    requirePickupOnHit,
    requireActorOther
} from "../Interaction/pairRuleClauses.js";
import { areHostile, inferFaction } from "./sandboxTargeting.js";
import { sandboxHostilePairs } from "./sandboxTargeting.js";

/** @typedef {import("../Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */

export const combatResolvers = { faction: inferFaction };
export const sandboxPairResolvers = {
    hostileDamageablePickup(self, other) {
        if (other.maxHealth == null) return false;
        return areHostile(self, other);
    },
};
export const withCombatResolvers = { resolvers: combatResolvers, pairResolvers: sandboxPairResolvers };
export const excludeUndefinedFactionOther = { exclusions: [{ target: "other", resolve: "faction", isUndefined: true }] };
export const includeCrossFactionHostile = { inclusionsAny: sandboxHostilePairs.map((pair) => ({ target: "pair", crossFaction: pair })) };

export const SANDBOX_HOSTILE_PAIR = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadEither, excludePassiveEither, excludeSameTeam, excludeSameFaction, includeCrossFactionHostile)
);

export const SANDBOX_SEPARATION = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadOther, excludeUndefinedFactionOther, excludeSameTeam, excludePushableOther)
);

export const SANDBOX_CHARGE_IMPACT = SANDBOX_HOSTILE_PAIR;

// Hostile projectiles damage sandbox combat pickups (humanoids, etc.) via faction collision.
export const requireDamageablePickup = { inclusions: [{ target: "other", has: "maxHealth" }] };
export const SANDBOX_PROJECTILE_HIT_ACTOR = /** @type {PairFilterConfig} */ (mergePairFilter(SANDBOX_HOSTILE_PAIR, requireDamageablePickup));
export const excludeHostileDamageablePickup = { exclusions: [{ target: "pair", pairResolve: "hostileDamageablePickup" }] };
export const SANDBOX_PROJECTILE_HIT_PICKUP = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadOther, requirePickupOnHit, excludeHostileDamageablePickup)
);

export const sandboxInteractionPairs = {
    separation: SANDBOX_SEPARATION,
    chargeImpact: SANDBOX_CHARGE_IMPACT,
    projectileHitActor: SANDBOX_PROJECTILE_HIT_ACTOR,
    projectileHitPickup: SANDBOX_PROJECTILE_HIT_PICKUP,
};
