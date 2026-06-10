/**
 * Per-instance sandbox behavior config stamped at assembly spawn.
 * Asset defaults are fallbacks only; assembly manifest overrides win.
 *
 * @param {object | null | undefined} pickup
 * @param {object | null | undefined} asset
 * @param {"cueStrike"} behaviorKey
 */
export function resolvePickupSandboxBehavior(pickup, asset, behaviorKey) {
    const stamped = pickup?.sandboxBehaviorOverrides?.[behaviorKey];
    const fromAsset = asset?.sandbox?.[behaviorKey];
    const assetOverrides = fromAsset === true ? {} : fromAsset && typeof fromAsset === "object" ? fromAsset : {};
    return stamped && typeof stamped === "object" ? { ...assetOverrides, ...stamped } : assetOverrides;
}
/**
 * @param {object | null | undefined} pickup
 * @param {object | null | undefined} asset
 * @param {string} behaviorId
 */
export function resolvePickupInputGateRules(pickup, asset, behaviorId) {
    const stamped = pickup?.sandboxBehaviorOverrides?.inputGates?.[behaviorId];
    if (Array.isArray(stamped)) return stamped;
    const fromAsset = asset?.sandbox?.inputGates?.[behaviorId];
    if (Array.isArray(fromAsset)) return fromAsset;
    return [];
}
/**
 * @param {object | null | undefined} pickup
 * @param {object | null | undefined} asset
 * @param {string} behaviorId
 */
export function resolvePickupInputGates(pickup, asset, behaviorId) {
    const rules = resolvePickupInputGateRules(pickup, asset, behaviorId);
    return { allowed: rules.length === 0, rules };
}
