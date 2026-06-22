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
