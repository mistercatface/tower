import { pickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { CombatParticles } from "../Render/CombatParticles.js";
import { sandboxInteractionPairs } from "./sandboxInteraction.js";
import { sandboxTargeting } from "./sandboxTargeting.js";
import { combatParticlesPhase, dispatchEventsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "./simulationPhases.js";
/**
 * @param {{ projectileZIndex?: number }} [options]
 * @returns {import("../../Core/GameDefinitionTypes.js").GameFeature[]}
 */
export function createSandboxCombatFeature({ projectileZIndex = 20 } = {}) {
    return [
        {
            initState(state) {
                state.entityLayers = state.entityLayers ?? [];
                state.combatParticles = state.combatParticles ?? [];
                state.projectiles = state.projectiles ?? [];
                state.activeLasers = state.activeLasers ?? [];
                if (!state.entityLayers.some((layer) => layer.key === "projectiles")) state.entityLayers.push({ key: "projectiles", zIndex: projectileZIndex });
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
        },
        { simulationPhaseInsertAfter: "pushablePhysics", simulationPhases: [ragdollCorpsePhase, dispatchEventsPhase] },
    ];
}
