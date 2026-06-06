import { LIBRARY_PROP_QUANTIZE_STEPS } from "../Libraries/Props/propRenderDefaults.js";
import { mergeQuantizeSteps } from "../Libraries/Config/mergePartial.js";

/** @type {typeof LIBRARY_PROP_QUANTIZE_STEPS} */
let activePropQuantizeSteps = LIBRARY_PROP_QUANTIZE_STEPS;

/** @returns {typeof LIBRARY_PROP_QUANTIZE_STEPS} */
export function getDefaultPropQuantizeSteps() {
    return activePropQuantizeSteps;
}

/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function applyGamePropQuantizeSettings(definition) {
    activePropQuantizeSteps = mergeQuantizeSteps(LIBRARY_PROP_QUANTIZE_STEPS, definition?.propQuantizeSteps);
}
