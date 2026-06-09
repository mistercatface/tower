import { PoolSimulationState } from "./PoolSimulationState.js";
import { poolRunScenePort } from "./runScenePort.js";
import { poolUiPort } from "./ui/poolUiPort.js";
import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { pushablePhysicsPhase, gameSceneTickPhase, worldSurfacePhase } from "../../Systems/Simulation/phases.js";
import { poolWorldGen } from "./worldGen.js";
import { registerPoolListeners } from "./listeners.js";
import { drawPoolPockets } from "./drawPockets.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase } from "../../Libraries/RunBootstrap/phases.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { PoolGameState } from "./PoolGameState.js";
import { registerPickupStates } from "../../Entities/PickupStates.js";
import { poolPickupStates } from "./pickupPoolStates.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Pool — rectangular table, drag-to-shoot cue, full 15-ball rack, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    createGameState() {
        return new PoolGameState();
    },
    canvasId: "gameCanvas",
    perspective: { cameraHeight: 520, strength: 0.28 },
    playback: { minSpeed: 0.25, maxSpeed: 2, step: 0.25 },
    proceduralDesign: { surfaceProfileId: SURFACE_PROFILE_ID.poolTableFelt },
    worldSurface: { wallHeight: 20, pixelsPerCell: 6 },
    simulationPort: createSimulationPort([pushablePhysicsPhase, gameSceneTickPhase, worldSurfacePhase]),
    uiPort: poolUiPort,
    render: { ...createDefaultRenderPorts(), simulationEffectPasses: [{ zIndex: 10, draw: drawPoolPockets }] },
    worldGen: poolWorldGen,
    runBootstrapPort: createRunBootstrapPort([generateWorldPhase]),
    runScenePort: poolRunScenePort,
    registerListeners: registerPoolListeners,
    states: { simulation: PoolSimulationState },
    initialState: "simulation",
    prepare() {
        registerPickupStates(poolPickupStates);
        document.title = "Pool";
        document.body.classList.add("shell-landscape-minimal");
    },
};
