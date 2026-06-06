import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import { getBootstrapPort } from "../../Core/GamePorts.js";
import { requestGamePause, requestGameResume } from "../../Core/EventSystem.js";
import { InputManager } from "../../Core/InputManager.js";
import { loadPersistentTriggers } from "../../Core/PersistentTriggers.js";
import { mountUiPort, registerUiEventListeners } from "../../UI/Core/mountUiPort.js";
import { preloadAllInspectAssets } from "../../Libraries/Inspect/InspectCatalog.js";
import { initializeSaveSystem, loadProgress } from "../../Progression/Storage.js";
import { StatsManager } from "../../Progression/StatsManager.js";
/**
 * @typedef {object} GameBootstrapContext
 * @property {import("../../Core/GameDefinitionTypes.js").GameDefinition} definition
 * @property {object} state
 * @property {object[]} upgrades
 * @property {import("../../Libraries/Events/EventBus.js").EventBus} events
 * @property {import("../../Core/PauseManager.js").PauseManager} pauseManager
 * @property {HTMLCanvasElement} canvas
 * @property {import("../../GameState/GameStateMachine.js").GameStateMachine} fsm
 * @property {import("../../Render/SimulationViewport.js").SimulationViewport} viewport
 * @property {() => void} resetGame
 * @property {() => void} resizeCanvas
 */
/**
 * Feature-gated createGame tail — no tower assumptions.
 *
 * @param {GameBootstrapContext} ctx
 */
export function applyGameBootstrap(ctx) {
    const { definition, state, upgrades, events, pauseManager, canvas, fsm, resetGame, resizeCanvas } = ctx;
    const { features } = getBootstrapPort();
    events.setContext({ state, upgrades, viewport: ctx.viewport, fsm, resetGame });
    events.warnOnMissingListeners = true;
    registerUiEventListeners(events);
    definition.wireRadio?.(events, { requestPause: requestGamePause, requestResume: requestGameResume });
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    if (features.upgrades) StatsManager.initUpgradesList(state, upgrades);
    if (features.save) {
        loadProgress(state, upgrades);
        initializeSaveSystem(state);
    }
    if (features.persistentTriggers) loadPersistentTriggers();
    mountUiPort({ state, upgrades });
    if (features.inspect) {
        inspectBridge.mount();
        definition.registerInspect?.();
        preloadAllInspectAssets();
    }
    resizeCanvas();
    InputManager.setup(canvas, fsm);
    resetGame();
}
