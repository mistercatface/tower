import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { combatParticlesPhase, dispatchEventsPhase, explosionsPhase, projectilesPhase, ragdollCorpsePhase } from "../../Libraries/Combat/simulationPhases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
const sandboxTickPhase = {
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort([
    sandboxTickPhase,
    projectilesPhase,
    explosionsPhase,
    combatParticlesPhase,
    pushablePhysicsPhase,
    ragdollCorpsePhase,
    dispatchEventsPhase,
    gameSceneTickPhase,
]);
