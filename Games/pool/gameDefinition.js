import "../../Render/WorldSurfaceBootstrap.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { MapState, InspectorState } from "../../GameState/GameStates.js";
import { PoolCombatState } from "./PoolCombatState.js";
import { registerPoolEntities } from "./config/entities.js";
import {
    onCombatEnter,
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

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

const POOL_BALL_PHYSICS = {
    hitBehavior: "none",
    radius: 6,
    isPushable: true,
    rolls: true,
    collisionShape: "circle",
    laserTargetable: false,
    mass: 1.0,
    friction: 0.5,
    wallPhysics: { restitution: 0.94, friction: 0.06 },
};

/** @param {Record<string, string>} panels */
function registerPoolBallType(propDefs, recipes, id, panels) {
    propDefs[id] = {
        render3DKey: id,
        renderMode: "3d",
        ...POOL_BALL_PHYSICS,
    };
    recipes[id] = PROP_RECIPE_BUILDERS.lofiSphere({
        defaultRadius: 6,
        panelCount: 2,
        latBands: 3,
        panels,
        stroke: null,
    });
}

/**
 * Phase 1 pool — rectangular table, drag-to-shoot cue, 2 object balls, 6 pockets.
 */
export const poolGame = {
    id: "pool",
    canvasId: "towerCanvas",
    saveKey: "pool_save_v1",

    combatPairs: poolCombatPairs,
    targeting: poolTargeting,
    render: poolRenderPorts,
    worldGen: poolWorldGen,

    createUpgrades() {
        return [];
    },

    states: {
        map: MapState,
        combat: PoolCombatState,
        inspector: InspectorState,
    },

    initialState: "combat",

    prepare() {
        document.title = "Pool";
        registerPoolEntities();

        const propDefs = getWorldPropDefinitions();
        const recipes = getWorldPropRecipes();
        registerPoolBallType(propDefs, recipes, "pool_cue_ball", ["#F5F5F5", "#E0E0E0"]);
        registerPoolBallType(propDefs, recipes, "pool_object_ball", ["#E53935", "#FFEB3B"]);

        installGameSurfaceProfileProvider();
    },

    wireRadio: wirePoolRadio,

    onRunOpeningComplete,
    isRadioDialogActive,

    onCombatEnter,
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
