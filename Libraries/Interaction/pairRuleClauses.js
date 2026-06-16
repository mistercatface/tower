import { spatialPairResolvers } from "./spatialPairResolvers.js";
export const withSpatialPairResolvers = { pairResolvers: spatialPairResolvers };
export const excludeDeadOther = { exclusions: [{ target: "other", prop: "isDead", equals: true }] };
export const excludeDeadEither = { exclusions: [{ target: "either", prop: "isDead", equals: true }] };
export const excludePassiveEither = { exclusions: [{ target: "either", prop: "isPassive", equals: true }] };
export const excludeSameTeam = { exclusions: [{ target: "pair", bothSet: "teamId", equal: true }] };
export const excludeSameFaction = { exclusions: [{ target: "pair", bothResolve: "faction", equal: true }] };
export const excludeSameEntity = { exclusions: [{ target: "pair", sameEntity: true }] };
export const excludePushableOther = { exclusions: [{ target: "other", has: "strategy.isPushable" }] };
export const requirePushableOther = { inclusions: [{ target: "other", has: "strategy.isPushable" }] };
export const requireWorldPropOnHit = { inclusions: [{ target: "other", hasFn: "strategy.onHit" }] };
export const dedupPairById = { inclusions: [{ target: "pair", selfIdLessThanOther: true }] };
export const requirePushablePairResolve = { inclusions: [{ target: "pair", pairResolve: "pushablePair" }] };
export const sleepBlockerNeighborAny = {
    inclusionsAny: [
        { target: "other", has: "separation" },
        { target: "other", has: "strategy.isPushable" },
    ],
};
