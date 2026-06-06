import { ensurePoolState } from "./balls.js";
import { PoolSimulationState } from "./PoolSimulationState.js";
import { registerPoolEntities } from "./config/entities.js";
import { onSimulationEnter, onRunSceneTick } from "./hooks.js";
import { poolRenderPorts, poolTargeting } from "./ports.js";
import { poolSimulation } from "./simulation.js";
import { poolWorldGen } from "./worldGen.js";
import { isRadioDialogActive, wirePoolRadio } from "./wireRadio.js";
import { getWorldPropDefinitions, getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { PROP_RECIPE_BUILDERS } from "../../Libraries/Props/recipes/index.js";
import {
    POOL_BALL_RADIUS,
    POOL_BALL_LOW_SPEED_THRESHOLD,
    POOL_BALL_LOW_SPEED_FRICTION,
    POOL_BALL_SNAP_SPEED,
} from "./config/tableLayout.js";
import { poolProceduralDesign, poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { LANDSCAPE_MINIMAL_UI } from "../../Core/GameUiProfile.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

const POOL_BALL_PHYSICS = {
    hitBehavior: "none",
    radius: POOL_BALL_RADIUS,
    isPushable: true,
    rolls: true,
    collisionShape: "circle",
    laserTargetable: false,
    mass: 1.0,
    friction: 0.5,
    lowSpeedFrictionThreshold: POOL_BALL_LOW_SPEED_THRESHOLD,
    lowSpeedFriction: POOL_BALL_LOW_SPEED_FRICTION,
    snapSpeed: POOL_BALL_SNAP_SPEED,
    wallPhysics: { restitution: 0.94, friction: 0.06 },
};

/** @param {object} [defaultPoolBall] */
function registerPoolBallType(propDefs, recipes, id, defaultPoolBall) {
    propDefs[id] = {
        render3DKey: id,
        renderMode: "3d",
        ...POOL_BALL_PHYSICS,
    };
    recipes[id] = PROP_RECIPE_BUILDERS.poolBall({
        defaultRadius: POOL_BALL_RADIUS,
        panelCount: 12,
        latBands: 8,
        stroke: null,
        defaultPoolBall,
    });
}

/**
 * Pool — rectangular table, drag-to-shoot cue, full 15-ball rack, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    canvasId: "gameCanvas",
    saveKey: "pool_save_v1",

    ui: {
        ...LANDSCAPE_MINIMAL_UI,
        runResult: {
            won: {
                title: "TABLE CLEAR!",
                buttonLabel: "PLAY AGAIN",
                titleColor: "#4CAF50",
            },
        },
    },

    getRunOutcome(state) {
        return ensurePoolState(state).won ? "won" : null;
    },

    perspective: {
        cameraHeight: 520,
        strength: 0.28,
        viewerSource: "viewport",
    },

    proceduralDesign: {
        surfaceProfileId: poolSurfaceProfileId,
        ...poolProceduralDesign,
    },

    worldSurface: {
        wallHeight: 20,
    },

    simulation: poolSimulation,
    targeting: poolTargeting,
    render: poolRenderPorts,
    worldGen: poolWorldGen,

    createUpgrades() {
        return [];
    },

    states: {
        simulation: PoolSimulationState,
    },

    initialState: "simulation",

    prepare() {
        document.title = "Pool";
        registerPoolEntities();

        const propDefs = getWorldPropDefinitions();
        const recipes = getWorldPropRecipes();
        registerPoolBallType(propDefs, recipes, "pool_cue_ball", { kind: "cue" });
        registerPoolBallType(propDefs, recipes, "pool_ball", { kind: "solid", number: 1, color: "#FFD600" });
    },

    wireRadio: wirePoolRadio,
    isRadioDialogActive,
    onSimulationEnter,
    onRunSceneTick,
};
