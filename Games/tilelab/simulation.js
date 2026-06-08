import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { dispatchEventsPhase, projectilesPhase, ragdollCorpsePhase, sandboxAutoCombatPhase } from "../../Libraries/Combat/simulationPhases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
const sandboxTickPhase = {
    id: "sandboxTick",
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort([sandboxTickPhase, sandboxAutoCombatPhase, projectilesPhase, pushablePhysicsPhase, ragdollCorpsePhase, dispatchEventsPhase, gameSceneTickPhase], {
    beginRuntime: (ctx) => ({ spatialFrame: combatSpatial.begin(ctx.state), events: [], abilityState: null }),
});
