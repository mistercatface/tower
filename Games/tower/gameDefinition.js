import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { registerGameInspectEntries } from "./content/inspect/inspectContent.js";
import { MapState, SimulationState, InspectorState } from "../../GameState/GameStates.js";
import { wireTowerRadio } from "./wireRadio.js";
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
import { registerTowerEntities } from "./config/entities.js";
import { applyInspectManifestToProps } from "./config/inspectManifest.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { towerInteractionPairs, towerRenderPorts, towerTargeting } from "./ports.js";
import { towerWorldGen } from "./worldGen.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

/** Tower — reference game definition. Engine ports injected via interactionPairs, targeting, render. */
export const towerGame = {
    id: "tower",
    canvasId: "towerCanvas",
    saveKey: "tower_save_v4",
    interactionPairs: towerInteractionPairs,
    targeting: towerTargeting,
    render: towerRenderPorts,
    worldGen: towerWorldGen,

    createUpgrades() {
        return [...createBaseUpgrades(), ...createUpgrades()];
    },

    states: { map: MapState, simulation: SimulationState, inspector: InspectorState },

    initialState: "simulation",

    prepare() {
        registerTowerEntities();
        applyInspectManifestToProps(getWorldPropDefinitions());
    },

    registerInspect() {
        registerGameInspectEntries();
    },
    wireRadio: wireTowerRadio,
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
