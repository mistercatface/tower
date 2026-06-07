import { PoolSimulationState } from "./PoolSimulationState.js";
import { MINIMAL_ARENA_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { poolRunScenePort } from "./runScenePort.js";
import { poolSimulation } from "./simulation.js";
import { poolUiPort } from "./ui/poolUiPort.js";
import { poolWorldGen } from "./worldGen.js";
import { poolRadioPort } from "./radioPort.js";
import { getWorldPropRecipes, getWorldPropDefinitions, getPropAsset } from "../../Libraries/Content/PropCatalog.js";
import { registerCueStickRecipe } from "../../Libraries/CueStick/registerCueStick.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { LANDSCAPE_MINIMAL_UI } from "../../Core/GameUiProfile.js";
import { createRunBootstrapPort } from "../../Libraries/RunBootstrap/RunBootstrapPipeline.js";
import { generateWorldPhase, initRunStatePhase } from "../../Libraries/RunBootstrap/phases.js";
import { emptyTargeting } from "../../Libraries/Targeting/emptyTargeting.js";
import { poolRenderPorts } from "./renderPorts.js";
import { POOL_BALL_RADIUS, setPoolBallRadius } from "./config/tableLayout.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Pool — rectangular table, drag-to-shoot cue, full 15-ball rack, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    propPixelSize: 8,
    forcePropPixelSize: true,
    canvasId: "gameCanvas",
    saveKey: "pool_save_v1",
    ui: { ...LANDSCAPE_MINIMAL_UI, chrome: { controls: "none" } },
    perspective: { cameraHeight: 520, strength: 0.28, viewerSource: "viewport" },
    proceduralDesign: { surfaceProfileId: SURFACE_PROFILE_ID.poolTableFelt },
    worldSurface: { wallHeight: 20, pixelsPerCell: 4 },
    simulationPort: poolSimulation,
    uiPort: poolUiPort,
    targeting: emptyTargeting,
    render: poolRenderPorts,
    worldGen: poolWorldGen,
    runBootstrapPort: createRunBootstrapPort([initRunStatePhase, generateWorldPhase]),
    bootstrapPort: MINIMAL_ARENA_BOOTSTRAP,
    runScenePort: poolRunScenePort,
    radioPort: poolRadioPort,
    createUpgrades() {
        return [];
    },
    states: { simulation: PoolSimulationState },
    initialState: "simulation",
    prepare() {
        document.title = "Pool";
        // To dynamically override the physical & visual size of the pool balls,
        // uncomment the line below and change the radius value (default is 12):
        // setPoolBallRadius(16);
        // Sync the radius down to the prop registry and visual assets so they render at the overridden size
        const defs = getWorldPropDefinitions();
        if (defs.pool_ball) defs.pool_ball.radius = POOL_BALL_RADIUS;
        if (defs.pool_cue_ball) defs.pool_cue_ball.radius = POOL_BALL_RADIUS;
        const ballAsset = getPropAsset("pool_ball");
        if (ballAsset) ballAsset.visuals.defaultRadius = POOL_BALL_RADIUS;
        const cueAsset = getPropAsset("pool_cue_ball");
        if (cueAsset) cueAsset.visuals.defaultRadius = POOL_BALL_RADIUS;
        registerCueStickRecipe(getWorldPropRecipes());
    },
};
