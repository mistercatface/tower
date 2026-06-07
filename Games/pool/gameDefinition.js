import { PoolSimulationState } from "./PoolSimulationState.js";
import { MINIMAL_ARENA_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { poolRunScenePort } from "./runScenePort.js";
import { poolSimulation } from "./simulation.js";
import { poolUiPort } from "./ui/poolUiPort.js";
import { poolWorldGen } from "./worldGen.js";
import { poolOutcomePort } from "./outcomePort.js";
import { poolRadioPort } from "./radioPort.js";
import { getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { registerCueStickRecipe } from "../../Libraries/CueStick/registerCueStick.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { LANDSCAPE_MINIMAL_UI } from "../../Core/GameUiProfile.js";
import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase, initRunStatePhase } from "../../Libraries/RunBootstrap/phases.js";
import { emptyTargeting } from "../../Libraries/Targeting/emptyTargeting.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Pool — rectangular table, drag-to-shoot cue, full 15-ball rack, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    canvasId: "gameCanvas",
    saveKey: "pool_save_v1",
    ui: { ...LANDSCAPE_MINIMAL_UI, runResult: { won: { title: "TABLE CLEAR!", buttonLabel: "PLAY AGAIN", titleColor: "#4CAF50" } } },
    perspective: { cameraHeight: 520, strength: 0.28, viewerSource: "viewport" },
    proceduralDesign: { surfaceProfileId: SURFACE_PROFILE_ID.poolTableFelt },
    worldSurface: { wallHeight: 20 },
    simulationPort: poolSimulation,
    uiPort: poolUiPort,
    targeting: emptyTargeting,
    render: createDefaultRenderPorts(),
    worldGen: poolWorldGen,
    runBootstrapPort: createRunBootstrapPort([initRunStatePhase, generateWorldPhase]),
    bootstrapPort: MINIMAL_ARENA_BOOTSTRAP,
    runScenePort: poolRunScenePort,
    radioPort: poolRadioPort,
    outcomePort: poolOutcomePort,
    createUpgrades() {
        return [];
    },
    states: { simulation: PoolSimulationState },
    initialState: "simulation",
    prepare() {
        document.title = "Pool";
        registerCueStickRecipe(getWorldPropRecipes());
    },
};
