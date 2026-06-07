import { getUiPort } from "../../Core/GamePorts.js";
import { Events } from "../../Core/EventSystem.js";
import { InputManager } from "../../Core/InputManager.js";
import { registerSharedOverlayListeners } from "../../UI/Core/sharedOverlays.js";
import { clearGameChrome } from "../../UI/Core/uiRoot.js";
/**
 * @typedef {object} GameBootstrapContext
 * @property {import("../../Core/GameDefinitionTypes.js").GameDefinition} definition
 * @property {object} state
 * @property {object[]} upgrades
 * @property {import("../../Libraries/Events/EventBus.js").EventBus} events
 * @property {import("../../Core/PauseManager.js").PauseManager} pauseManager
 * @property {HTMLCanvasElement} canvas
 * @property {import("../Libraries/FSM/StateMachine.js").StateMachine} fsm
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
    const { state, upgrades, events, canvas, fsm, resetGame, resizeCanvas } = ctx;
    events.setContext({ state, upgrades, viewport: ctx.viewport, fsm, resetGame });
    events.warnOnMissingListeners = true;
    registerUiEventListeners(events);
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    clearGameChrome();
    getUiPort().mount({ state, upgrades });
    resizeCanvas();
    InputManager.setup(canvas, fsm);
    resetGame();
}
