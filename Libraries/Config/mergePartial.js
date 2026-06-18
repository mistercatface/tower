/**
 * Deep-merge partial overrides onto a defaults object (known nested keys only).
 * See `.cursor/rules/defaults-override-chain.mdc` for library → game → entity layering.
 *
 * @template {Record<string, unknown>} T
 * @param {T} base
 * @param {...Partial<T> | null | undefined} overrides
 * @returns {T}
 */
export function mergePartial(base, overrides = {}, ...more) {
    /** @type {T} */
    let result = { ...base };
    const layers = [overrides, ...more];
    for (let i = 0; i < layers.length; i++) {
        const o = layers[i];
        if (!o) continue;
        result = { ...result, ...o };
        if (o.restitution && typeof o.restitution === "object") result.restitution = { ...(result.restitution ?? {}), ...o.restitution };
        if (o.motionSubsteps && typeof o.motionSubsteps === "object") result.motionSubsteps = { ...(result.motionSubsteps ?? {}), ...o.motionSubsteps };
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
