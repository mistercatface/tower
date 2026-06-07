import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import { getBootstrapPort, getInspectPort, getRadioPort, getUiPort } from "../../Core/GamePorts.js";
import { Events, requestGamePause, requestGameResume } from "../../Core/EventSystem.js";
import { InputManager } from "../../Core/InputManager.js";
import { loadPersistentTriggers } from "../../Core/PersistentTriggers.js";
import { registerSharedOverlayListeners } from "../../UI/Core/sharedOverlays.js";
import { clearGameChrome } from "../../UI/Core/uiRoot.js";
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
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
function registerUiEventListeners(eventBus) {
    eventBus.on(Events.UI_UPDATE, (data) => {
        getUiPort().updateUI({ state: data.state, upgrades: data.upgrades });
    });
    eventBus.on(Events.UI_UPDATE_HUD, (data) => {
        getUiPort().updateHud({ state: data.state, upgrades: data.upgrades });
    });
    registerSharedOverlayListeners(eventBus);
}
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
    getRadioPort().wire?.(events, { requestPause: requestGamePause, requestResume: requestGameResume });
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    if (features.upgrades) StatsManager.initUpgradesList(state, upgrades);
    if (features.save) {
        loadProgress(state, upgrades);
        initializeSaveSystem(state);
    }
    if (features.persistentTriggers) loadPersistentTriggers();
    clearGameChrome();
    getUiPort().mount({ state, upgrades });
    if (features.inspect) {
        inspectBridge.mount();
        getInspectPort().registerEntries?.();
        preloadAllInspectAssets();
    }
    resizeCanvas();
    InputManager.setup(canvas, fsm);
    resetGame();
}
