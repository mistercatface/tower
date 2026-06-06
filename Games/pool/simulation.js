import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { runSimulationEnterPersistence } from "../../Systems/Simulation/simulationEnterPersistence.js";
import {
    pushablePhysicsPhase,
    dispatchEventsPhase,
    gameSceneTickPhase,
    worldSurfacePhase,
} from "../../Systems/Simulation/phases.js";

/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const poolSimulation = createSimulationPort(
    [
        pushablePhysicsPhase,
        dispatchEventsPhase,
        gameSceneTickPhase,
        worldSurfacePhase,
    ],
    {
        onEnter(ctx) {
            runSimulationEnterPersistence(ctx.state);
        },
    },
);
