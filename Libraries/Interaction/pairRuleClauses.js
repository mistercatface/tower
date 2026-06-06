import { spatialPairResolvers } from "./spatialPairResolvers.js";
/** @typedef {import("./pairRules.js").PairFilterConfig} PairFilterConfig */
/** @type {PairFilterConfig} */
export const withSpatialPairResolvers = { pairResolvers: spatialPairResolvers };
/** @type {PairFilterConfig} */
export const excludeDeadOther = { exclusions: [{ target: "other", prop: "isDead", equals: true }] };
/** @type {PairFilterConfig} */
export const excludeDeadEither = { exclusions: [{ target: "either", prop: "isDead", equals: true }] };
/** @type {PairFilterConfig} */
export const excludePassiveEither = { exclusions: [{ target: "either", prop: "isPassive", equals: true }] };
/** @type {PairFilterConfig} */
export const excludeSameTeam = { exclusions: [{ target: "pair", bothSet: "teamId", equal: true }] };
/** @type {PairFilterConfig} */
export const excludeSameFaction = { exclusions: [{ target: "pair", bothResolve: "faction", equal: true }] };
/** @type {PairFilterConfig} */
export const excludeSameEntity = { exclusions: [{ target: "pair", sameEntity: true }] };
/** @type {PairFilterConfig} */
export const excludeActorOther = { exclusions: [{ target: "other", has: "separation" }] };
/** @type {PairFilterConfig} */
export const excludePushableOther = { exclusions: [{ target: "other", has: "strategy.isPushable" }] };
/** @type {PairFilterConfig} */
export const requireActorOther = { inclusions: [{ target: "other", has: "separation" }] };
/** @type {PairFilterConfig} */
export const requirePushableOther = { inclusions: [{ target: "other", has: "strategy.isPushable" }] };
/** @type {PairFilterConfig} */
export const requirePickupOnHit = { inclusions: [{ target: "other", hasFn: "strategy.onHit" }] };
/** @type {PairFilterConfig} */
export const dedupPairById = { inclusions: [{ target: "pair", selfIdLessThanOther: true }] };
/** @type {PairFilterConfig} */
export const requireActorPushableResolve = { inclusions: [{ target: "pair", pairResolve: "actorPushable" }] };
/** @type {PairFilterConfig} */
export const requirePushablePairResolve = { inclusions: [{ target: "pair", pairResolve: "pushablePair" }] };
/** @type {PairFilterConfig} */
export const sleepBlockerNeighborAny = {
    inclusionsAny: [
        { target: "other", has: "separation" },
        { target: "other", has: "strategy.isPushable" },
    ],
};
