import "../../Render/WorldSurfaceBootstrap.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { registerGameInspectEntries } from "./content/inspect/inspectContent.js";
import { MapState, CombatState, InspectorState } from "../../GameState/GameStates.js";
import { unlockStartGameGuardsDialog } from "./tutorial/StartGameIntro.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { wireTowerRadio } from "./wireRadio.js";
import {
    onCombatEnter,
    onCombatTick,
    onCombatEnemyKilled,
    canRunHordeSpawning,
    getInspectMissionBanner,
    findInspectorInspectPickup,
} from "./hooks.js";
import "../../Entities/Zombie.js";

/**
 * Tower — reference game definition. Balance/content live under Config/;
 * game-specific pair presets under Games/tower/presets/.
 *
 * @typedef {object} GameDefinition
 * @property {string} id
 * @property {string} canvasId — DOM canvas element id
 * @property {string} [saveKey] — localStorage key (documentation; Storage.js owns persistence today)
 * @property {() => object[]} createUpgrades
 * @property {Record<string, new () => object>} states — FSM state constructors
 * @property {string} initialState — FSM state name used on reset
 * @property {() => void | Promise<void>} [prepare] — run before canvas/render setup
 * @property {() => void} [registerInspect]
 * @property {(ctx: { state: object, upgrades: object[] }) => void} [onRunStart]
 * @property {string} [runStartRadioTrigger] — fireRadioTrigger id on new run
 * @property {(eventBus: object, pauseApi: { requestPause: (reason: string) => void, requestResume: (reason: string) => void }) => void} [wireRadio]
 * @property {(ctx: object) => void} [onCombatEnter]
 * @property {(state: object) => void} [onCombatTick]
 * @property {(payload: { enemy: object, state: object, upgrades: object[], fsm: object }) => void} [onCombatEnemyKilled]
 * @property {(state: object) => boolean} [canRunHordeSpawning]
 * @property {(state: object) => { show: boolean, text: string }} [getInspectMissionBanner]
 * @property {(state: object, worldX: number, worldY: number) => object | null} [findInspectorInspectPickup]
 */

/** @type {GameDefinition} */
export const towerGame = {
    id: "tower",
    canvasId: "towerCanvas",
    saveKey: "tower_save_v4",

    createUpgrades() {
        return [...createBaseUpgrades(), ...createUpgrades()];
    },

    states: {
        map: MapState,
        combat: CombatState,
        inspector: InspectorState,
    },

    initialState: "combat",

    prepare() {
        installGameSurfaceProfileProvider();
    },

    registerInspect() {
        registerGameInspectEntries();
    },

    onRunStart({ state, upgrades }) {
        ProgressionManager.setupNewRunAbilities(state, upgrades);
        unlockStartGameGuardsDialog(state);
    },

    runStartRadioTrigger: "run_start",

    wireRadio: wireTowerRadio,

    onCombatEnter,
    onCombatTick,
    onCombatEnemyKilled,
    canRunHordeSpawning,
    getInspectMissionBanner,
    findInspectorInspectPickup,
};
