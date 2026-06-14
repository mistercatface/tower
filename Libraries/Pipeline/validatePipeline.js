import { getByPath } from "./objectPath.js";
import { validateFieldValue } from "./fieldSchema.js";
import { stepId } from "./stepRegistry.js";
/**
 * @typedef {{ path: string, message: string }} PipelineValidationError
 * @typedef {{ ok: true } | { ok: false, errors: PipelineValidationError[] }} PipelineValidationResult
 */
/** @param {PipelineValidationError[]} errors @returns {PipelineValidationResult} */
function fail(errors) {
    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
/** @param {string} prefix @param {string} segment */
function joinPath(prefix, segment) {
    if (!prefix) return segment;
    if (!segment) return prefix;
    return `${prefix}.${segment}`;
}
/**
 * @param {Record<string, unknown>} config
 * @param {import("./stepRegistry.js").PipelineStepDef} def
 * @param {string} pathPrefix
 * @returns {PipelineValidationError[]}
 */
function validateStepFields(config, def, pathPrefix) {
    /** @type {PipelineValidationError[]} */
    const errors = [];
    for (const field of def.fields ?? []) {
        const message = validateFieldValue(getByPath(config, field.path), field);
        if (message) errors.push({ path: joinPath(pathPrefix, field.path), message });
    }
    return errors;
}
/**
 * @param {Record<string, unknown>} config
 * @param {ReturnType<import("./stepRegistry.js").createStepRegistry>} registry
 * @param {{ pathPrefix?: string }} [options]
 * @returns {PipelineValidationError[]}
 */
export function collectStepValidationErrors(config, registry, options = {}) {
    const pathPrefix = options.pathPrefix ?? "";
    /** @type {PipelineValidationError[]} */
    const errors = [];
    const id = stepId(config);
    if (!id) {
        errors.push({ path: pathPrefix, message: "step is missing op or type" });
        return errors;
    }
    const def = registry.get(id);
    if (!def) {
        errors.push({ path: joinPath(pathPrefix, stepId(config) ?? "step"), message: `unknown step: ${id}` });
        return errors;
    }
    errors.push(...validateStepFields(config, def, pathPrefix));
    if (def.validate) {
        const message = def.validate(config);
        if (message) errors.push({ path: pathPrefix, message });
    }
    for (const slot of def.slots ?? []) {
        const child = config[slot.name];
        if (child == null) continue;
        if (typeof child !== "object" || Array.isArray(child)) {
            errors.push({ path: joinPath(pathPrefix, slot.name), message: `${slot.name} must be a step object` });
            continue;
        }
        const childConfig = /** @type {Record<string, unknown>} */ (child);
        const childId = stepId(childConfig);
        if (slot.allowedSteps?.length && childId && !slot.allowedSteps.includes(childId))
            errors.push({ path: joinPath(pathPrefix, slot.name), message: `${slot.name} step "${childId}" is not allowed here` });
        errors.push(...collectStepValidationErrors(childConfig, registry, { pathPrefix: joinPath(pathPrefix, slot.name) }));
    }
    return errors;
}
/**
 * @param {Record<string, unknown>} config
 * @param {ReturnType<import("./stepRegistry.js").createStepRegistry>} registry
 * @param {{ pathPrefix?: string }} [options]
 * @returns {PipelineValidationResult}
 */
export function validateStepConfig(config, registry, options = {}) {
    return fail(collectStepValidationErrors(config, registry, options));
}
/**
 * @param {{ config: Record<string, unknown> }[]} rows
 * @param {ReturnType<import("./stepRegistry.js").createStepRegistry>} registry
 * @returns {PipelineValidationResult}
 */
export function validatePipelineRows(rows, registry) {
    /** @type {PipelineValidationError[]} */
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        errors.push(...collectStepValidationErrors(row.config, registry, { pathPrefix: `[${i}]` }));
    }
    return fail(errors);
}
