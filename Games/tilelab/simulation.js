import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { combatParticlesPhase, dispatchEventsPhase, explosionsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { FloatingText } from "../../Libraries/Render/FloatingText.js";
const sandboxTickPhase = {
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
const floatingTextsPhase = {
    run(ctx, dt) {
        FloatingText.updateAll(ctx.state, dt);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort(
    [
        sandboxTickPhase,
        sandboxAutoCombatPhase,
        projectilesPhase,
        explosionsPhase,
        combatParticlesPhase,
        floatingTextsPhase,
        pushablePhysicsPhase,
        ragdollCorpsePhase,
        dispatchEventsPhase,
        gameSceneTickPhase,
    ],
    { beginRuntime: (ctx) => ({ spatialFrame: combatSpatial.begin(ctx.state), events: [], abilityState: null }) },
);
