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
import { getWorldPropDefinitions, getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { registerCueStickRecipe } from "../../Libraries/CueStick/registerCueStick.js";
import { PROP_RECIPE_BUILDERS } from "../../Libraries/Props/recipes/index.js";
import { POOL_BALL_RADIUS, POOL_BALL_LOW_SPEED_THRESHOLD, POOL_BALL_LOW_SPEED_FRICTION, POOL_BALL_SNAP_SPEED } from "./config/tableLayout.js";
import { poolProceduralDesign, poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { LANDSCAPE_MINIMAL_UI } from "../../Core/GameUiProfile.js";
import { createSingleArenaRunBootstrapPort } from "../../Libraries/RunBootstrap/presets/singleArena.js";
import { hideArenaPlayer } from "./arenaPlayer.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
const POOL_BALL_PHYSICS = {
    hitBehavior: "none",
    radius: POOL_BALL_RADIUS,
    isPushable: true,
    rolls: true,
    collisionShape: "circle",
    laserTargetable: false,
    mass: 1.0,
    pairRestitution: 0.92,
    friction: 0.5,
    lowSpeedFrictionThreshold: POOL_BALL_LOW_SPEED_THRESHOLD,
    lowSpeedFriction: POOL_BALL_LOW_SPEED_FRICTION,
    snapSpeed: POOL_BALL_SNAP_SPEED,
    wallPhysics: { restitution: 0.94, friction: 0.06 },
};
/** @param {object} [defaultPoolBall] */
function registerPoolBallType(propDefs, recipes, id, defaultPoolBall) {
    propDefs[id] = { render3DKey: id, renderMode: "3d", ...POOL_BALL_PHYSICS };
    recipes[id] = PROP_RECIPE_BUILDERS.poolBall({ defaultRadius: POOL_BALL_RADIUS, panelCount: 12, latBands: 8, stroke: null, defaultPoolBall });
}
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
    runBootstrapPort: createSingleArenaRunBootstrapPort(hideArenaPlayer),
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
        const propDefs = getWorldPropDefinitions();
        const recipes = getWorldPropRecipes();
        registerCueStickRecipe(recipes);
        registerPoolBallType(propDefs, recipes, "pool_cue_ball", { kind: "cue" });
        registerPoolBallType(propDefs, recipes, "pool_ball", { kind: "solid", number: 1, color: "#FFD600" });
    },
};
