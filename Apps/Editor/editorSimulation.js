import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { CombatParticles } from "../../Libraries/Render/CombatParticles.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import { combatParticlesPhase, dispatchEventsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
import { pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { FLOATING_TEXT_SPAWN_EVENT, FloatingText } from "../../Libraries/Render/FloatingText.js";
import { tilelabGroundZonePhase } from "./groundZones.js";
import { sandboxVoidZonePhase } from "./sandboxVoidZones.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { engine } from "./engine.js";
const sandboxTickPhase = {
    id: "sandboxTick",
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
const floatingTextPhase = {
    id: "floatingText",
    run(ctx, dt) {
        FloatingText.updateAll(ctx.state, dt);
    },
};
engine.interactionPairs = sandboxInteractionPairs;
engine.targeting = sandboxTargeting;
engine.simulationPort = createSimulationPort(
    [
        sandboxTickPhase,
        sandboxAutoCombatPhase,
        projectilesPhase,
        combatParticlesPhase,
        pushablePhysicsPhase,
        ragdollCorpsePhase,
        dispatchEventsPhase,
        sandboxVoidZonePhase,
        tilelabGroundZonePhase,
        floatingTextPhase,
    ],
    {
        beginRuntime(ctx) {
            return { spatialFrame: combatSpatial.begin(ctx.state), events: [] };
        },
    },
);
engine.render.drawPostSimulation = (state, viewport, ctx) => {
    CombatParticles.renderAll(ctx, state, viewport);
};
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerEngineSimulationListeners(eventBus) {
    eventBus.on(FLOATING_TEXT_SPAWN_EVENT, FloatingText.handleSpawnEvent);
}
