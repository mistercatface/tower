/** @param {object | null | undefined} prop @param {object | null | undefined} asset @param {"cueStrike"} behaviorKey */
export function resolveWorldPropSandboxBehavior(prop, asset, behaviorKey) {
    const stamped = prop?.sandboxBehaviorOverrides?.[behaviorKey];
    return stamped && typeof stamped === "object" ? stamped : {};
}
/** @param {object | null | undefined} prop @param {object | null | undefined} asset @param {string} behaviorId */
export function resolveWorldPropInputGateRules(prop, asset, behaviorId) {
    const stamped = prop?.sandboxBehaviorOverrides?.inputGates?.[behaviorId];
    return Array.isArray(stamped) ? stamped : [];
}
