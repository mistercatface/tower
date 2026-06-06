import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { MapState, SimulationState, InspectorState } from "../../GameState/GameStates.js";
import { COMBAT_ROGUELIKE_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { NOOP_OUTCOME_PORT } from "../../Libraries/Ports/noopPorts.js";
import { towerInspectPort } from "./inspectPort.js";
import { towerCombatPort } from "./combatPort.js";
import { towerRadioPort } from "./radioPort.js";
import { towerRunScenePort } from "./runScenePort.js";
import { registerTowerEntities } from "./config/entities.js";
import { applyInspectManifestToProps } from "./config/inspectManifest.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { towerInteractionPairs, towerRenderPorts, towerTargeting } from "./ports.js";
import { towerSimulation } from "./simulation.js";
import { towerUiPort } from "./ui/towerUiPort.js";
import { createRoguelikeRunBootstrapPort } from "../../Libraries/RunBootstrap/presets/roguelikeMap.js";
import { towerWorldGen } from "./worldGen.js";
import { towerProceduralDesign } from "./config/surfaceProfiles.js";
import { TOWER_UI_PROFILE } from "./uiProfile.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** Tower — reference game definition. Engine ports injected via interactionPairs, targeting, render. */
export const towerGame = {
    id: "tower",
    canvasId: "gameCanvas",
    saveKey: "tower_save_v4",
    ui: TOWER_UI_PROFILE,
    proceduralDesign: towerProceduralDesign,
    interactionPairs: towerInteractionPairs,
    simulationPort: towerSimulation,
    uiPort: towerUiPort,
    targeting: towerTargeting,
    render: towerRenderPorts,
    worldGen: towerWorldGen,
    runBootstrapPort: createRoguelikeRunBootstrapPort(),
    bootstrapPort: COMBAT_ROGUELIKE_BOOTSTRAP,
    runScenePort: towerRunScenePort,
    inspectPort: towerInspectPort,
    combatPort: towerCombatPort,
    radioPort: towerRadioPort,
    outcomePort: NOOP_OUTCOME_PORT,
    createUpgrades() {
        return [...createBaseUpgrades(), ...createUpgrades()];
    },
    states: { map: MapState, simulation: SimulationState, inspector: InspectorState },
    initialState: "simulation",
    prepare() {
        registerTowerEntities();
        applyInspectManifestToProps(getWorldPropDefinitions());
    },
};
