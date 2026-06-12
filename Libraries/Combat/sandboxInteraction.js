import { mergePairFilter } from "../Interaction/pairRules.js";
import {
    excludeDeadOther,
    excludeDeadEither,
    excludePassiveEither,
    excludeSameTeam,
    excludeSameFaction,
    excludePushableOther,
    requireWorldPropOnHit,
    requireActorOther
} from "../Interaction/pairRuleClauses.js";
import { areHostile, inferFaction } from "./sandboxTargeting.js";
import { sandboxHostilePairs } from "./sandboxTargeting.js";

/** @typedef {import("../Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */

export const combatResolvers = { faction: inferFaction };
export const sandboxPairResolvers = {
    hostileDamageableWorldProp(self, other) {
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

// Hostile projectiles damage sandbox combat world props (humanoids, etc.) via faction collision.
export const requireDamageableWorldProp = { inclusions: [{ target: "other", has: "maxHealth" }] };
export const SANDBOX_PROJECTILE_HIT_ACTOR = /** @type {PairFilterConfig} */ (mergePairFilter(SANDBOX_HOSTILE_PAIR, requireDamageableWorldProp));
export const excludeHostileDamageableWorldProp = { exclusions: [{ target: "pair", pairResolve: "hostileDamageableWorldProp" }] };
export const SANDBOX_PROJECTILE_HIT_WORLD_PROP = /** @type {PairFilterConfig} */ (
    mergePairFilter(withCombatResolvers, excludeDeadOther, requireWorldPropOnHit, excludeHostileDamageableWorldProp)
);

export const sandboxInteractionPairs = {
    separation: SANDBOX_SEPARATION,
    chargeImpact: SANDBOX_CHARGE_IMPACT,
    projectileHitActor: SANDBOX_PROJECTILE_HIT_ACTOR,
    projectileHitWorldProp: SANDBOX_PROJECTILE_HIT_WORLD_PROP,
};
