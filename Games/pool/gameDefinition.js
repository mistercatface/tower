import { PoolSimulationState } from "./PoolSimulationState.js";
import { registerPoolEntities } from "./config/entities.js";
import { MINIMAL_ARENA_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { poolRunScenePort } from "./runScenePort.js";
import { poolRenderPorts, poolTargeting } from "./ports.js";
import { poolSimulation } from "./simulation.js";
import { poolUiPort } from "./ui/poolUiPort.js";
import { poolWorldGen } from "./worldGen.js";
import { NOOP_COMBAT_PORT, NOOP_INSPECT_PORT } from "../../Libraries/Ports/noopPorts.js";
import { poolOutcomePort } from "./outcomePort.js";
import { poolRadioPort } from "./radioPort.js";
import { getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { registerCueStickRecipe } from "../../Libraries/CueStick/registerCueStick.js";
import { poolProceduralDesign, poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { LANDSCAPE_MINIMAL_UI } from "../../Core/GameUiProfile.js";
import { createSingleArenaRunBootstrapPort } from "../../Libraries/RunBootstrap/presets/singleArena.js";
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
    proceduralDesign: { surfaceProfileId: poolSurfaceProfileId, ...poolProceduralDesign },
    worldSurface: { wallHeight: 20 },
    simulationPort: poolSimulation,
    uiPort: poolUiPort,
    targeting: poolTargeting,
    render: poolRenderPorts,
    worldGen: poolWorldGen,
    runBootstrapPort: createSingleArenaRunBootstrapPort(),
    bootstrapPort: MINIMAL_ARENA_BOOTSTRAP,
    runScenePort: poolRunScenePort,
    inspectPort: NOOP_INSPECT_PORT,
    combatPort: NOOP_COMBAT_PORT,
    radioPort: poolRadioPort,
    outcomePort: poolOutcomePort,
    createUpgrades() {
        return [];
    },
    states: { simulation: PoolSimulationState },
    initialState: "simulation",
    prepare() {
        document.title = "Pool";
        registerPoolEntities();
        registerCueStickRecipe(getWorldPropRecipes());
    },
};
