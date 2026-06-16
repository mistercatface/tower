export const excludeDeadOther = { exclusions: [{ target: "other", prop: "isDead", equals: true }] };
export const excludeDeadEither = { exclusions: [{ target: "either", prop: "isDead", equals: true }] };
export const excludePassiveEither = { exclusions: [{ target: "either", prop: "isPassive", equals: true }] };
export const excludeSameTeam = { exclusions: [{ target: "pair", bothSet: "teamId", equal: true }] };
export const excludeSameFaction = { exclusions: [{ target: "pair", bothResolve: "faction", equal: true }] };
export const excludePushableOther = { exclusions: [{ target: "other", has: "strategy.isPushable" }] };
export const requireWorldPropOnHit = { inclusions: [{ target: "other", hasFn: "strategy.onHit" }] };
export const sleepBlockerNeighborAny = { inclusionsAny: [{ target: "other", has: "strategy.isPushable" }] };
