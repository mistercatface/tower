/** @param {object | null | undefined} pickup @param {object | null | undefined} asset @param {"cueStrike"} behaviorKey */
export function resolvePickupSandboxBehavior(pickup, asset, behaviorKey) {
    const stamped = pickup?.sandboxBehaviorOverrides?.[behaviorKey];
    return stamped && typeof stamped === "object" ? stamped : {};
}
/** @param {object | null | undefined} pickup @param {object | null | undefined} asset @param {string} behaviorId */
export function resolvePickupInputGateRules(pickup, asset, behaviorId) {
    const stamped = pickup?.sandboxBehaviorOverrides?.inputGates?.[behaviorId];
    return Array.isArray(stamped) ? stamped : [];
}
/** @param {object | null | undefined} pickup @param {object | null | undefined} asset @param {string} behaviorId */
export function resolvePickupInputGates(pickup, asset, behaviorId) {
    const rules = resolvePickupInputGateRules(pickup, asset, behaviorId);
    return { allowed: rules.length === 0, rules };
}
