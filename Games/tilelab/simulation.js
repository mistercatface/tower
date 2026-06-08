import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { combatParticlesPhase, dispatchEventsPhase, explosionsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
const sandboxTickPhase = {
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
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
        pushablePhysicsPhase,
        ragdollCorpsePhase,
        dispatchEventsPhase,
        gameSceneTickPhase,
        // features in future?
    ],
    { beginRuntime: (ctx) => ({ spatialFrame: combatSpatial.begin(ctx.state), events: [], abilityState: null }) },
);
