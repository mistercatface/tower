import { engine, initEngineState, prepareEngine } from "./engine.js";
import { registerEngineSimulationListeners } from "./editorSimulation.js";
import "./editorSimulation.js";
import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { registerCoreListeners } from "../../Core/GameListeners.js";
import { PauseManager } from "../../Core/PauseManager.js";
import { bootstrapEngine } from "../../Core/bootstrapEngine.js";
import { applyGameCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { applyGamePropPixelSize } from "../../Core/GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "../../Core/GamePropQuantizeSettings.js";
import { mountGameUi } from "../../UI/Core/uiRoot.js";
import { initEditorSession } from "./index.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { renderTilelabPreview } from "./ui/preview.js";
import { readControls } from "./ui/toolbar.js";
/** Editor boot — shared engine setup and loop. */
export function createEditorApp() {
    const state = engine.createGameState();
    initEngineState(state);
    installGameState(state);
    prepareEngine();
    engine.prepare?.();
    bootstrapEngine(engine);
    applyGameCollisionSettings(engine);
    applyGamePropQuantizeSettings(engine);
    applyGamePropPixelSize(engine);
    const viewport = state.viewport;
    const simulation = engine.simulationPort;
    const pauseManager = new PauseManager(state);
    function tickSimulation(dt) {
        if (state.isPaused) return;
        simulation.runTick({ state }, dt);
    }
    function drawFrame() {
        renderTilelabPreview(state, readControls(state));
    }
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        state.scheduler.update(dt);
        if (!state.isPaused) {
            state.gameTime += dt * state.selectedSpeed;
            tickSimulation(dt * state.selectedSpeed);
        }
        drawFrame();
        requestAnimationFrame(loop);
    }
    function enterEditor() {
        initEditorSession({ state });
        requestUiUpdate();
    }
    function resizeCanvas() {
        engine.onCanvasResize?.();
    }
    registerCoreListeners(events, pauseManager, engine);
    registerEngineSimulationListeners(events);
    events.setContext({ state, viewport });
    events.warnOnMissingListeners = true;
    events.on(Events.UI_UPDATE, () => {
        tilelabUiPort.updateUI({ state });
    });
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    mountGameUi(tilelabUiPort, state);
    resizeCanvas();
    enterEditor();
    requestAnimationFrame(loop);
}
