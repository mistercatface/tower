import { createSimulationPort } from "../Systems/Simulation/SimulationPipeline.js";
/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Merge feature hooks into a game definition before bootstrap.
 * Keeps core/renderer unaware of individual feature implementations.
 *
 * @param {GameDefinition} definition
 */
export function applyGameFeatures(definition) {
    const { features } = definition;
    if (!features?.length) return;
    mergeFeatureRenderHooks(definition);
    mergeFeatureSimulationPhases(definition);
}
/** @param {GameDefinition} definition */
function mergeFeatureRenderHooks(definition) {
    const render = definition.render;
    if (!render) return;
    for (const feature of definition.features) {
        if (feature.simulationEffectPasses?.length) render.simulationEffectPasses = [...(render.simulationEffectPasses ?? []), ...feature.simulationEffectPasses];
        if (feature.drawPostSimulation) {
            const previous = render.drawPostSimulation;
            const next = feature.drawPostSimulation;
            render.drawPostSimulation = previous
                ? (state, viewport, ctx, renderer) => {
                      previous(state, viewport, ctx, renderer);
                      next(state, viewport, ctx, renderer);
                  }
                : next;
        }
    }
}
/** @param {GameDefinition} definition */
function mergeFeatureSimulationPhases(definition) {
    const port = definition.simulationPort;
    if (!port?.phases) return;
    let phases = [...port.phases];
    let changed = false;
    for (const feature of definition.features) {
        if (!feature.simulationPhases?.length) continue;
        const anchor = feature.simulationPhaseInsertAfter;
        if (anchor) {
            const index = phases.findIndex((phase) => phase.id === anchor);
            if (index >= 0) phases.splice(index + 1, 0, ...feature.simulationPhases);
            else phases.push(...feature.simulationPhases);
        } else phases.push(...feature.simulationPhases);
        changed = true;
    }
    if (!changed) return;
    definition.simulationPort = createSimulationPort(phases, { beginRuntime: port.beginRuntime, onEnter: port.onEnter });
}
