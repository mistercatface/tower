function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mergeObjectTreeLayer(base, overrides) {
    const out = { ...base };
    for (const key of Object.keys(overrides)) {
        const patch = overrides[key];
        const prev = base[key];
        if (isPlainObject(patch) && isPlainObject(prev)) out[key] = mergeObjectTreeLayer(prev, patch);
        else out[key] = patch;
    }
    return out;
}
/**
 * Recursively merge plain-object overrides onto defaults (arrays/scalars replace).
 * Use for deep config trees (game tuning) instead of hand-written per-field spreads.
 *
 * @template {Record<string, unknown>} T
 * @param {T} base
 * @param {...Partial<T> | null | undefined} overrides
 * @returns {T}
 */
export function mergeObjectTree(base, overrides = {}, ...more) {
    let result = base;
    const layers = [overrides, ...more];
    for (let i = 0; i < layers.length; i++) {
        const o = layers[i];
        if (!o) continue;
        result = mergeObjectTreeLayer(result, o);
    }
    return result;
}
/**
 * @param {{ facing?: number }} base
 * @param {...{ facing?: number } | null | undefined} overrides
 */
export function mergeQuantizeSteps(base, overrides = {}, ...more) {
    let facing = base.facing;
    const layers = [overrides, ...more];
    for (let i = 0; i < layers.length; i++) {
        const o = layers[i];
        if (o?.facing != null) facing = o.facing;
    }
    return { facing };
}
