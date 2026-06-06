import "../../Render/WorldSurfaceBootstrap.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { MapState, InspectorState } from "../../GameState/GameStates.js";
import { YardballCombatState } from "./CombatState.js";
import { registerYardballEntities } from "./config/entities.js";
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
import { yardballCombatPairs, yardballRenderPorts, yardballTargeting } from "./ports.js";
import { yardballWorldGen } from "./worldGen.js";
import { wireYardballRadio } from "./wireRadio.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

/**
 * Yard Ball — tap-to-nudge the beach ball through the opening building.
 * No shooting, no horde, no clue hunt. Camera follows the ball.
 */
export const yardballGame = {
    id: "yardball",
    canvasId: "towerCanvas",
    saveKey: "yardball_save_v1",

    combatPairs: yardballCombatPairs,
    targeting: yardballTargeting,
    render: yardballRenderPorts,
    worldGen: yardballWorldGen,

    createUpgrades() {
        return [];
    },

    states: {
        map: MapState,
        combat: YardballCombatState,
        inspector: InspectorState,
    },

    initialState: "combat",

    prepare() {
        document.title = "Yard Ball";
        registerYardballEntities();
        installGameSurfaceProfileProvider();
    },

    wireRadio: wireYardballRadio,

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
