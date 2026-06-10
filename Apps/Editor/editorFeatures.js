import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import { combatParticlesPhase, dispatchEventsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameFeature} GameFeature */
const combatCoreFeature = {
    initState(state) {
        state.entityLayers = state.entityLayers ?? [];
        state.combatParticles = state.combatParticles ?? [];
        state.projectiles = state.projectiles ?? [];
        state.activeLasers = state.activeLasers ?? [];
        if (!state.entityLayers.some((layer) => layer.key === "projectiles")) state.entityLayers.push({ key: "projectiles", zIndex: 20 });
    },
    prepare() {
        for (const key of Object.keys(pickupStates)) if (key !== "normal") delete pickupStates[key];
        Object.assign(pickupStates, combatPickupStates);
    },
    interactionPairs: sandboxInteractionPairs,
    targeting: sandboxTargeting,
    beginRuntime(ctx) {
        return { spatialFrame: combatSpatial.begin(ctx.state), events: [] };
    },
    simulationPhaseInsertAfter: "sandboxTick",
    simulationPhases: [sandboxAutoCombatPhase, projectilesPhase, combatParticlesPhase],
    drawPostSimulation(state, viewport, ctx) {
        CombatParticles.renderAll(ctx, state, viewport);
    },
};
const combatDispatchFeature = { simulationPhaseInsertAfter: "pushablePhysics", simulationPhases: [ragdollCorpsePhase, dispatchEventsPhase] };
const floatingTextFeature = {
    initState(state) {
        state.entityLayers = state.entityLayers ?? [];
        state.floatingTexts = state.floatingTexts ?? [];
        if (!state.entityLayers.some((layer) => layer.key === "floatingTexts")) state.entityLayers.push({ key: "floatingTexts", zIndex: 100 });
    },
    simulationPhases: [
        {
            run(ctx, dt) {
                FloatingText.updateAll(ctx.state, dt);
            },
        },
    ],
    registerListeners(eventBus) {
        eventBus.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
    },
};
/** @type {GameFeature[]} */
const editorFeatures = [combatCoreFeature, combatDispatchFeature, floatingTextFeature];
/** @param {GameDefinition} profile */
function mergeFeaturePorts(profile) {
    for (const feature of editorFeatures) {
        if (feature.interactionPairs) profile.interactionPairs = { ...(profile.interactionPairs ?? {}), ...feature.interactionPairs };
        if (feature.targeting) profile.targeting = feature.targeting;
    }
}
/** @param {GameDefinition} profile */
function mergeFeatureRenderHooks(profile) {
    const render = profile.render;
    if (!render) return;
    for (const feature of editorFeatures) {
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
/** @param {GameDefinition} profile */
function mergeFeatureSimulationPhases(profile) {
    const port = profile.simulationPort;
    if (!port?.phases) return;
    let phases = [...port.phases];
    let phasesChanged = false;
    let beginRuntime = port.beginRuntime;
    for (const feature of editorFeatures) {
        if (feature.beginRuntime) beginRuntime = feature.beginRuntime;
        if (!feature.simulationPhases?.length) continue;
        const anchor = feature.simulationPhaseInsertAfter;
        if (anchor) {
            const index = phases.findIndex((phase) => phase.id === anchor);
            if (index >= 0) phases.splice(index + 1, 0, ...feature.simulationPhases);
            else phases.push(...feature.simulationPhases);
        } else phases.push(...feature.simulationPhases);
        phasesChanged = true;
    }
    if (!phasesChanged && beginRuntime === port.beginRuntime) return;
    profile.simulationPort = createSimulationPort(phases, { beginRuntime, onEnter: port.onEnter });
}
/** Merge combat, FX, and other editor modules into the engine profile before bootstrap. */
export function composeEditorProfile(profile) {
    mergeFeaturePorts(profile);
    mergeFeatureRenderHooks(profile);
    mergeFeatureSimulationPhases(profile);
}
/** @param {object} state */
export function initEditorFeatureState(state) {
    for (const feature of editorFeatures) feature.initState?.(state);
}
export function prepareEditorFeatures() {
    for (const feature of editorFeatures) feature.prepare?.();
}
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerEditorFeatureListeners(eventBus) {
    for (const feature of editorFeatures) feature.registerListeners?.(eventBus);
}
