import { getActiveGameDefinition, setActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { bootstrapEngine } from "../../Core/bootstrapEngine.js";
import { SharedGameState } from "../../GameState/SharedGameState.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { loadPropAssets } from "../../Libraries/Content/loadPropAssets.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { layoutOnlyRunBootstrap } from "../../Libraries/RunBootstrap/phases.js";
import { createRoguelikeWorldGenPort, roguelikeProceduralDesign } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
let labEngineBootstrapped = false;
const labDefinition = {
    id: "lab",
    canvasId: "gameCanvas",
    createGameState() {
        return new SharedGameState();
    },
    states: { simulation: class {} },
    initialState: "simulation",
    simulationPort: { runTick() {} },
    uiPort: { mount() {}, updateHud() {}, updateUI() {} },
    render: createDefaultRenderPorts(),
    worldGen: createRoguelikeWorldGenPort(),
    runBootstrapPort: layoutOnlyRunBootstrap,
    runScenePort: { getLayout: () => null, onSimulationEnter() {}, onTick() {} },
    proceduralDesign: roguelikeProceduralDesign,
};
export function ensureLabGameDefinition() {
    if (Object.keys(getWorldPropDefinitions()).length === 0) loadPropAssets();
    if (!getActiveGameDefinition()) setActiveGameDefinition(labDefinition);
    if (!labEngineBootstrapped) {
        bootstrapEngine(labDefinition);
        labEngineBootstrapped = true;
    }
}
