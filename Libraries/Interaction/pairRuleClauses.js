export const excludeDeadOther = { exclusions: [{ target: "other", prop: "isDead", equals: true }] };
export const excludeDeadEither = { exclusions: [{ target: "either", prop: "isDead", equals: true }] };
export const excludePassiveEither = { exclusions: [{ target: "either", prop: "isPassive", equals: true }] };
export const excludeKineticOther = { exclusions: [{ target: "other", has: "strategy.isKinetic" }] };
export const sleepBlockerNeighborAny = { inclusionsAny: [{ target: "other", has: "strategy.isKinetic" }] };
