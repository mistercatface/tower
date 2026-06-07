import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { MapState, SimulationState, InspectorState } from "../../GameState/GameStates.js";
import { COMBAT_ROGUELIKE_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { towerInspectPort } from "./inspectPort.js";
import { towerCombatPort } from "./combatPort.js";
import { towerRadioPort } from "./wireRadio.js";
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
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** @typedef {import("../../Core/GameUiProfile.js").GameUiProfile} GameUiProfile */
/** @type {GameUiProfile} */
const TOWER_UI_PROFILE = {
    shell: "tower",
    chrome: { score: true, perks: true, map: true, settings: true, bottomPanel: true, controls: "full", zoomSlider: true },
    combat: { entityBars: true, targetMarkers: true, combatHudModes: true, visibilityMask: true, hostileActors: true, playerActors: true, offScreenIndicators: true, globeOverlay: true },
    lifecycle: "player-health",
};
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
