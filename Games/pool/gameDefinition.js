import "../../Render/WorldSurfaceBootstrap.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { ensurePoolState } from "./balls.js";
import { PoolSimulationState } from "./PoolSimulationState.js";
import { registerPoolEntities } from "./config/entities.js";
import {
    onSimulationEnter,
    onRunSceneTick,
    onCombatEnemyKilled,
    canRunHordeSpawning,
    blocksTurretTargeting,
    getInspectMissionBanner,
    findInspectorInspectPickup,
    onInspectMissionOpen,
    onInspectMissionClose,
    isInspectMissionActive,
    onRunOpeningComplete,
    isRadioDialogActive,
} from "./hooks.js";
import { poolCombatPairs, poolRenderPorts, poolTargeting } from "./ports.js";
import { poolWorldGen } from "./worldGen.js";
import { wirePoolRadio } from "./wireRadio.js";
import { getWorldPropDefinitions, getWorldPropRecipes } from "../../Libraries/Content/PropCatalog.js";
import { PROP_RECIPE_BUILDERS } from "../../Libraries/Props/recipes/index.js";
import { POOL_BALL_RADIUS, POOL_RAIL_HEIGHT } from "./config/tableLayout.js";
import { poolProceduralDesign, poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { buildPoolRailRoofClipRegions } from "./config/roofClip.js";
import { poolRunScenePorts } from "./runScenePorts.js";

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
    canvasId: "towerCanvas",
    saveKey: "pool_save_v1",

    ui: {
        shell: "landscape-minimal",
        chrome: {
            score: false,
            perks: false,
            map: false,
            settings: true,
            bottomPanel: false,
            controls: "pause-only",
            zoomSlider: false,
        },
        combat: {
            entityBars: false,
            targetMarkers: false,
            combatHudModes: false,
            visibilityMask: false,
            hostileActors: false,
            playerActors: false,
            offScreenIndicators: false,
            globeOverlay: false,
        },
        lifecycle: "custom",
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

    propPixelSize: 32,

    proceduralDesign: {
        surfaceProfileId: poolSurfaceProfileId,
        ...poolProceduralDesign,
    },

    worldSurface: {
        roofZLevels: [POOL_RAIL_HEIGHT],
    },

    getHorizontalSurfaceClipRegions(state) {
        const layout = poolRunScenePorts.getLayout(state);
        return buildPoolRailRoofClipRegions(layout);
    },

    combatPairs: poolCombatPairs,
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

        installGameSurfaceProfileProvider();
    },

    wireRadio: wirePoolRadio,

    onRunOpeningComplete,
    isRadioDialogActive,

    onSimulationEnter,
    onRunSceneTick,
    onCombatEnemyKilled,
    canRunHordeSpawning,
    blocksTurretTargeting,
    getInspectMissionBanner,
    findInspectorInspectPickup,
    onInspectMissionOpen,
    onInspectMissionClose,
    isInspectMissionActive,
};
