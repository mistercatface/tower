import { inferFaction } from "../../../Combat/Targeting.js";

/** @typedef {import("../pairRules.js").PairFilterConfig} PairFilterConfig */

const combatResolvers = { faction: inferFaction };

/** Locomotion separation between combatants (default SeparationEngine preset). */
export const COMBAT_SEPARATION = /** @type {PairFilterConfig} */ ({
    resolvers: combatResolvers,
    exclusions: [
        { target: "other", prop: "isDead", equals: true },
        { target: "other", resolve: "faction", isUndefined: true },
        { target: "pair", bothSet: "teamId", equal: true },
        { target: "pair", other: { resolve: "faction", equals: "player" }, self: { prop: "attackType", equals: "charge" } },
        { target: "pair", self: { resolve: "faction", equals: "player" }, other: { prop: "attackType", equals: "charge" } },
    ],
});

/** Projectile may hit hostile actors (replaces areHostile + instanceof Actor). */
export const PROJECTILE_HIT_ACTOR = /** @type {PairFilterConfig} */ ({
    resolvers: combatResolvers,
    exclusions: [
        { target: "other", prop: "isDead", equals: true },
        { target: "either", prop: "isPassive", equals: true },
        { target: "pair", bothSet: "teamId", equal: true },
        { target: "pair", bothResolve: "faction", equal: true },
    ],
    inclusions: [
        { target: "other", has: "separation" },
        { target: "pair", crossFaction: ["player", "enemy"] },
    ],
});

/** Hostile combatant pair (matches areHostile). */
export const COMBAT_HOSTILE_PAIR = /** @type {PairFilterConfig} */ ({
    resolvers: combatResolvers,
    exclusions: [
        { target: "either", prop: "isDead", equals: true },
        { target: "either", prop: "isPassive", equals: true },
        { target: "pair", bothSet: "teamId", equal: true },
        { target: "pair", bothResolve: "faction", equal: true },
    ],
    inclusions: [{ target: "pair", crossFaction: ["player", "enemy"] }],
});

/** Charge impact applies damage on hostile contact. */
export const CHARGE_IMPACT = COMBAT_HOSTILE_PAIR;

/** Combatant–combatant collision pairs (deduped, actors only). */
export const COMBATANT_PAIR = /** @type {PairFilterConfig} */ ({
    exclusions: [{ target: "other", prop: "isDead", equals: true }],
    inclusions: [
        { target: "other", has: "separation" },
        { target: "pair", selfIdLessThanOther: true },
    ],
});

/** Neighbor can block pushable sleep (overlapping actor or pushable). */
export const PUSHABLE_SLEEP_BLOCKER = /** @type {PairFilterConfig} */ ({
    exclusions: [{ target: "other", prop: "isDead", equals: true }],
    inclusionsAny: [
        { target: "other", has: "separation" },
        { target: "other", has: "strategy.isPushable" },
    ],
});

/** Projectile may hit damageable pickups (not actors). */
export const PROJECTILE_HIT_PICKUP = /** @type {PairFilterConfig} */ ({
    exclusions: [
        { target: "other", prop: "isDead", equals: true },
        { target: "other", has: "separation" },
    ],
    inclusions: [{ target: "other", hasFn: "strategy.onHit" }],
});
