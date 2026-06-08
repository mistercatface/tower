import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase, pushablePhysicsPhase } from "../../Systems/Simulation/phases.js";
import { getTilelabSandboxController } from "./world/tilelabSandbox.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
const sandboxTickPhase = {
    run(ctx, dt) {
        getTilelabSandboxController()?.tick(dt);
    },
};
const ragdollTickPhase = {
    run(ctx, dt, runtime) {
        RagdollCorpse.updateAll(ctx.state, dt, runtime.spatialFrame);
    },
};
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort([sandboxTickPhase, ragdollTickPhase, pushablePhysicsPhase, gameSceneTickPhase]);
