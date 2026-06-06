import "../../Render/WorldSurfaceBootstrap.js";
import { installGameSurfaceProfileProvider } from "../../Config/procedural/bootstrap.js";
import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { registerGameInspectEntries } from "./content/inspect/inspectContent.js";
import { MapState, CombatState, InspectorState } from "../../GameState/GameStates.js";
import { wireTowerRadio } from "./wireRadio.js";
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
import { registerTowerEntities } from "./config/entities.js";
import { applyInspectManifestToProps } from "./config/inspectManifest.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { towerCombatPairs, towerRenderPorts, towerTargeting } from "./ports.js";
import { towerWorldGen } from "./worldGen.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

/** Tower — reference game definition. Engine ports injected via combatPairs, targeting, render. */
export const towerGame = {
    id: "tower",
    canvasId: "towerCanvas",
    saveKey: "tower_save_v4",

    combatPairs: towerCombatPairs,
    targeting: towerTargeting,
    render: towerRenderPorts,
    worldGen: towerWorldGen,

    createUpgrades() {
        return [...createBaseUpgrades(), ...createUpgrades()];
    },

    states: { map: MapState, combat: CombatState, inspector: InspectorState },

    initialState: "combat",

    prepare() {
        registerTowerEntities();
        applyInspectManifestToProps(getWorldPropDefinitions());
        installGameSurfaceProfileProvider();
    },

    registerInspect() {
        registerGameInspectEntries();
    },

    wireRadio: wireTowerRadio,

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
