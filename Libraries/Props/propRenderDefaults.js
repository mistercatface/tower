/** @typedef {typeof LIBRARY_PROP_QUANTIZE_STEPS} LibraryPropQuantizeSteps */
/** Crate-sized facing baseline (16 steps); larger footprints scale up in resolvePropQuantizeSteps. Optional overrides: strategy.quantizeSteps, gameDefinition.propQuantizeSteps. */
export const LIBRARY_PROP_QUANTIZE_STEPS = { facing: 16 };
let activePropQuantizeSteps = structuredClone(LIBRARY_PROP_QUANTIZE_STEPS);
export function getDefaultPropQuantizeSteps() {
    return activePropQuantizeSteps;
}
export function applyGamePropQuantizeSettings(definition) {
    const facing = definition?.propQuantizeSteps?.facing;
    activePropQuantizeSteps = structuredClone({ facing: facing != null ? facing : LIBRARY_PROP_QUANTIZE_STEPS.facing });
}
