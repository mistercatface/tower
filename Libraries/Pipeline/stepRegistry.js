/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   defaults: Record<string, unknown>,
 *   fields?: import("./fieldSchema.js").FieldDef[],
 *   slots?: { name: string, allowedSteps?: string[] }[],
 *   validate?: (config: Record<string, unknown>) => string | null,
 * }} PipelineStepDef
 */

/** @param {Record<string, unknown> | null | undefined} config */
export function stepId(config) {
    if (config == null || typeof config !== "object") return null;
    const id = config.op ?? config.type;
    return typeof id === "string" && id.length > 0 ? id : null;
}

/** @returns {{ register: (def: PipelineStepDef) => void, get: (id: string) => PipelineStepDef | undefined, has: (id: string) => boolean, list: () => PipelineStepDef[] }} */
export function createStepRegistry() {
    /** @type {Map<string, PipelineStepDef>} */
    const steps = new Map();
    return {
        register(def) {
            steps.set(def.id, def);
        },
        get(id) {
            return steps.get(id);
        },
        has(id) {
            return steps.has(id);
        },
        list() {
            return [...steps.values()];
        },
    };
}

/**
 * Register procedural {@link MOTIF_TYPES} entries as pipeline step defs (`type` → `id`).
 * @param {ReturnType<typeof createStepRegistry>} registry
 * @param {Record<string, { label?: string, defaults?: Record<string, unknown>, fields?: import("./fieldSchema.js").FieldDef[] }>} motifTypes
 */
export function registerMotifTypes(registry, motifTypes) {
    for (const [type, meta] of Object.entries(motifTypes)) {
        registry.register({
            id: type,
            label: meta.label ?? type,
            defaults: meta.defaults ?? { type },
            fields: meta.fields ?? [],
        });
    }
}
