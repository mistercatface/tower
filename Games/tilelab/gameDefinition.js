import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { layoutOnlyRunBootstrap } from "../../Libraries/RunBootstrap/phases.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { TileLabGameState } from "./TileLabGameState.js";
import { TileLabSimulationState } from "./TileLabSimulationState.js";
import { tilelabSimulation } from "./simulation.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { tilelabRunScenePort } from "./runScenePort.js";
import { registerTilelabListeners } from "./listeners.js";

/** @typedef {import("../../Core/GameDefinitionTypes.js").GameDefinition} GameDefinition */

export const tilelabGame = {
    id: "tilelab",
    canvasId: "gameCanvas",
    createGameState() {
        return new TileLabGameState();
    },
    states: { simulation: TileLabSimulationState },
    initialState: "simulation",
    simulationPort: tilelabSimulation,
    uiPort: tilelabUiPort,
    render: createDefaultRenderPorts(),
    worldGen: createRoguelikeWorldGenPort(),
    proceduralDesign: roguelikeProceduralDesign,
    runBootstrapPort: layoutOnlyRunBootstrap,
    runScenePort: tilelabRunScenePort,
    registerListeners: registerTilelabListeners,
    prepare() {
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
