import { createTowerRunBootstrapPort } from "./runBootstrap.js";
import { MapState, SimulationState, InspectorState } from "./states.js";
import { inspectBridge } from "./inspect/InspectBridge.js";
import { towerInput } from "./input.js";
import { isTowerWorldScene } from "./towerPhase.js";
import { towerCombatPort } from "./combatPort.js";
import * as towerTargeting from "./targeting.js";
import { towerRunScenePort } from "./runScenePort.js";
import { registerTowerEntities } from "./config/entities.js";
import { applyInspectManifestToProps } from "./config/inspectManifest.js";
import { getWorldPropDefinitions } from "../../Libraries/Props/PropCatalog.js";
import { towerInteractionPairs, towerRenderPorts } from "./ports.js";
import { towerSimulation } from "./simulation.js";
import { towerUiPort } from "./ui/towerUiPort.js";
import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { towerKeyBindings } from "./keyBindings.js";
import { registerTowerListeners } from "./listeners.js";
import { TowerGameState } from "./TowerGameState.js";
import { SpriteCache } from "../../Libraries/Canvas/SpriteCache.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
export const towerGame = {
    id: "tower",
    caches: { actorCache: new SpriteCache(), turretCache: new SpriteCache() },
    createGameState() {
        return new TowerGameState();
    },
    canvasId: "gameCanvas",
    saveKey: "tower_save_v4",
    collisionSettings: { chargeImpactDamage: 2 },
    proceduralDesign: roguelikeProceduralDesign,
    interactionPairs: towerInteractionPairs,
    simulationPort: towerSimulation,
    uiPort: towerUiPort,
    targeting: towerTargeting,
    render: towerRenderPorts,
    worldGen: createRoguelikeWorldGenPort(),
    runBootstrapPort: createTowerRunBootstrapPort(),
    isWorldScene: isTowerWorldScene,
    input: towerInput,
    runScenePort: towerRunScenePort,
    combatPort: towerCombatPort,
    keyBindings: towerKeyBindings,
    registerListeners: registerTowerListeners,
    onCanvasResize() {
        inspectBridge.resize();
    },
    states: { map: MapState, simulation: SimulationState, inspector: InspectorState },
    initialState: "simulation",
    prepare() {
        document.body.classList.remove("shell-landscape-minimal");
        registerTowerEntities();
        applyInspectManifestToProps(getWorldPropDefinitions());
    },
};
