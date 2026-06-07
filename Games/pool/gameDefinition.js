import { PoolSimulationState } from "./PoolSimulationState.js";
import { MINIMAL_ARENA_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { poolRunScenePort } from "./runScenePort.js";
import { poolSimulation } from "./simulation.js";
import { poolUiPort } from "./ui/poolUiPort.js";
import { poolWorldGen } from "./worldGen.js";
import { isRadioDialogActive, wirePoolRadio } from "./wireRadio.js";
import { drawPoolPockets } from "./drawPockets.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase, initRunStatePhase } from "../../Libraries/RunBootstrap/phases.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createCachedWorldStructure } from "../../Libraries/Render/worldStructure/CachedWorldStructure.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Pool — rectangular table, drag-to-shoot cue, full 15-ball rack, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    canvasId: "gameCanvas",
    saveKey: "pool_save_v1",
    perspective: { cameraHeight: 520, strength: 0.28, viewerSource: "viewport" },
    proceduralDesign: { surfaceProfileId: SURFACE_PROFILE_ID.poolTableFelt },
    worldSurface: { wallHeight: 20, pixelsPerCell: 6 },
    simulationPort: poolSimulation,
    uiPort: poolUiPort,
    render: { ...createDefaultRenderPorts(), worldStructure: createCachedWorldStructure(), simulationEffectPasses: [{ zIndex: 10, draw: drawPoolPockets }] },
    worldGen: poolWorldGen,
    runBootstrapPort: createRunBootstrapPort([initRunStatePhase, generateWorldPhase]),
    bootstrapPort: MINIMAL_ARENA_BOOTSTRAP,
    runScenePort: poolRunScenePort,
    radioPort: { wire: wirePoolRadio, isDialogActive: isRadioDialogActive },
    states: { simulation: PoolSimulationState },
    initialState: "simulation",
    prepare() {
        document.title = "Pool";
        document.body.classList.add("shell-landscape-minimal");
    },
};
