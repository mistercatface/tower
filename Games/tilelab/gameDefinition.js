import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { tilelabMapTopology } from "./mapTopology.js";
import { layoutOnlyRunBootstrap } from "../../Libraries/RunBootstrap/phases.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
import { TileLabGameState } from "./TileLabGameState.js";
import { TileLabSimulationState } from "./TileLabSimulationState.js";
import { tilelabSimulation } from "./simulation.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { tilelabRunScenePort } from "./runScenePort.js";
import { registerTilelabListeners } from "./listeners.js";
import { getGameState } from "../../GameState/GameState.js";
import { syncLabScreenCanvasBounds } from "./ui/labCanvas.js";
import { registerPickupStates } from "../../Entities/PickupStates.js";
import { combatPickupStates } from "../../Entities/pickupCombatStates.js";
import { sandboxInteractionPairs } from "../../Libraries/Combat/sandboxInteraction.js";
import { sandboxTargeting } from "../../Libraries/Combat/sandboxTargeting.js";
import { tilelabViewPort } from "./viewPort.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */
export const tilelabGame = {
    id: "tilelab",
    canvasId: "gameCanvas",
    interactionPairs: sandboxInteractionPairs,
    targeting: sandboxTargeting,
    createGameState() {
        return new TileLabGameState();
    },
    states: { simulation: TileLabSimulationState },
    initialState: "simulation",
    simulationPort: tilelabSimulation,
    uiPort: tilelabUiPort,
    render: createDefaultRenderPorts({ weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) }),
    worldGen: createRoguelikeWorldGenPort({ topology: tilelabMapTopology }),
    proceduralDesign: roguelikeProceduralDesign,
    runBootstrapPort: layoutOnlyRunBootstrap,
    runScenePort: tilelabRunScenePort,
    viewPort: tilelabViewPort,
    registerListeners: registerTilelabListeners,
    onCanvasResize() {
        const state = getGameState();
        if (state) syncLabScreenCanvasBounds(state);
    },
    prepare() {
        registerPickupStates(combatPickupStates);
        document.title = "Tile Lab";
        document.body.classList.add("shell-tilelab");
        if (!document.getElementById("tilelab-css")) {
            const link = document.createElement("link");
            link.id = "tilelab-css";
            link.rel = "stylesheet";
            link.href = new URL("./tilelab.css", import.meta.url).href;
            document.head.appendChild(link);
        }
    },
};
