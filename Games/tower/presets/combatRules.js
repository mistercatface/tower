import { inferFaction } from "../targeting.js";
import { hostileFactionPairs } from "../../../Config/content/factions.js";
import { isPairActive, shouldResolveActorPushable, shouldResolvePushablePair } from "../../../Libraries/Spatial/collision/entityBroadphase.js";

/** @typedef {import("../../../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig */

export const combatResolvers = { faction: inferFaction };

export const spatialPairResolvers = {
    actorPushable: shouldResolveActorPushable,
    pairActive: isPairActive,
    pushablePair: shouldResolvePushablePair,
};

/** @type {PairFilterConfig} */
export const withCombatResolvers = { resolvers: combatResolvers };

/** @type {PairFilterConfig} */
export const withSpatialPairResolvers = { pairResolvers: spatialPairResolvers };

/** @type {PairFilterConfig} */
export const excludeDeadOther = {
    exclusions: [{ target: "other", prop: "isDead", equals: true }],
};

/** @type {PairFilterConfig} */
export const excludeDeadEither = {
    exclusions: [{ target: "either", prop: "isDead", equals: true }],
};

/** @type {PairFilterConfig} */
export const excludePassiveEither = {
    exclusions: [{ target: "either", prop: "isPassive", equals: true }],
};

/** @type {PairFilterConfig} */
export const excludeSameTeam = {
    exclusions: [{ target: "pair", bothSet: "teamId", equal: true }],
};

/** @type {PairFilterConfig} */
export const excludeSameFaction = {
    exclusions: [{ target: "pair", bothResolve: "faction", equal: true }],
};

/** @type {PairFilterConfig} */
export const excludeUndefinedFactionOther = {
    exclusions: [{ target: "other", resolve: "faction", isUndefined: true }],
};

/** @type {PairFilterConfig} */
export const excludeChargeVsPlayer = {
    exclusions: [
        { target: "pair", other: { resolve: "faction", equals: "player" }, self: { prop: "attackType", equals: "charge" } },
        { target: "pair", self: { resolve: "faction", equals: "player" }, other: { prop: "attackType", equals: "charge" } },
    ],
};

/** @type {PairFilterConfig} */
export const excludeActorOther = {
    exclusions: [{ target: "other", has: "separation" }],
};

/** @type {PairFilterConfig} */
export const excludePushableOther = {
    exclusions: [{ target: "other", has: "strategy.isPushable" }],
};

/** @type {PairFilterConfig} */
export const excludeSameEntity = {
    exclusions: [{ target: "pair", sameEntity: true }],
};

/** @type {PairFilterConfig} */
export const includeCrossFactionHostile = {
    inclusions: hostileFactionPairs.map((pair) => ({ target: "pair", crossFaction: pair })),
};

/** @type {PairFilterConfig} */
export const requireActorOther = {
    inclusions: [{ target: "other", has: "separation" }],
};

/** @type {PairFilterConfig} */
export const requirePushableOther = {
    inclusions: [{ target: "other", has: "strategy.isPushable" }],
};

/** @type {PairFilterConfig} */
export const requirePickupOnHit = {
    inclusions: [{ target: "other", hasFn: "strategy.onHit" }],
};

/** @type {PairFilterConfig} */
export const dedupPairById = {
    inclusions: [{ target: "pair", selfIdLessThanOther: true }],
};

/** @type {PairFilterConfig} */
export const requireActorPushableResolve = {
    inclusions: [{ target: "pair", pairResolve: "actorPushable" }],
};

/** @type {PairFilterConfig} */
export const requirePairActive = {
    inclusions: [{ target: "pair", pairResolve: "pairActive" }],
};

/** @type {PairFilterConfig} */
export const requirePushablePairResolve = {
    inclusions: [{ target: "pair", pairResolve: "pushablePair" }],
};

/** @type {PairFilterConfig} */
export const sleepBlockerNeighborAny = {
    inclusionsAny: [
        { target: "other", has: "separation" },
        { target: "other", has: "strategy.isPushable" },
    ],
};
