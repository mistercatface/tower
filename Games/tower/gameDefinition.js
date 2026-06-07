import { createUpgrades, createBaseUpgrades } from "../../Progression/Upgrades.js";
import { MapState, SimulationState, InspectorState } from "./states.js";
import { COMBAT_ROGUELIKE_BOOTSTRAP } from "../../Libraries/Bootstrap/presets.js";
import { towerInspectPort } from "./inspectPort.js";
import { towerCombatPort } from "./combatPort.js";
import { isRadioDialogActive, wireTowerRadio } from "./wireRadio.js";
import * as towerTargeting from "./targeting.js";
import { towerRunScenePort } from "./runScenePort.js";
import { registerTowerEntities } from "./config/entities.js";
import { applyInspectManifestToProps } from "./config/inspectManifest.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { towerInteractionPairs, towerRenderPorts } from "./ports.js";
import { towerSimulation } from "./simulation.js";
import { towerUiPort } from "./ui/towerUiPort.js";
import { createRoguelikeRunBootstrapPort } from "../../Libraries/RunBootstrap/presets/roguelikeMap.js";
import { towerWorldGen } from "./worldGen.js";
import { towerProceduralDesign } from "./config/surfaceProfiles.js";
import { towerKeyBindings } from "./keyBindings.js";
import { registerTowerListeners } from "./listeners.js";
import { TowerGameState } from "./TowerGameState.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
/** Tower — reference game definition. Engine ports injected via interactionPairs, targeting, render. */
export const towerGame = {
    id: "tower",
    createGameState() {
        return new TowerGameState();
    },
    canvasId: "gameCanvas",
    saveKey: "tower_save_v4",
    combat: { entityBars: true, targetMarkers: true, combatHudModes: true, visibilityMask: true, hostileActors: true, playerActors: true, offScreenIndicators: true, globeOverlay: true },
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
    radioPort: { wire: wireTowerRadio, isDialogActive: isRadioDialogActive },
    keyBindings: towerKeyBindings,
    registerListeners: registerTowerListeners,
    createUpgrades() {
        return [...createBaseUpgrades(), ...createUpgrades()];
    },
    states: { map: MapState, simulation: SimulationState, inspector: InspectorState },
    initialState: "simulation",
    prepare() {
        document.body.classList.remove("shell-landscape-minimal");
        registerTowerEntities();
        applyInspectManifestToProps(getWorldPropDefinitions());
    },
};
