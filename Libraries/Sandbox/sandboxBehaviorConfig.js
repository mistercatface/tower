import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
/** @param {object} state @param {object | null | undefined} prop @param {object | null | undefined} asset @param {"cueStrike"} behaviorKey */
export function resolveWorldPropSandboxBehavior(state, prop, asset, behaviorKey) {
    const stamped = getSandboxEntityMeta(state).getBehaviorOverrides(prop?.id)?.[behaviorKey];
    return stamped && typeof stamped === "object" ? stamped : {};
}
/** @param {object} state @param {object | null | undefined} prop @param {object | null | undefined} asset @param {string} behaviorId */
export function resolveWorldPropInputGateRules(state, prop, asset, behaviorId) {
    const stamped = getSandboxEntityMeta(state).getBehaviorOverrides(prop?.id)?.inputGates?.[behaviorId];
    return Array.isArray(stamped) ? stamped : [];
}
