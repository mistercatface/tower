import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { gameSceneTickPhase } from "../../Systems/Simulation/phases.js";

/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const tilelabSimulation = createSimulationPort([gameSceneTickPhase]);
