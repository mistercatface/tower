import { composeEditorProfile, initEditorFeatureState, prepareEditorFeatures, registerEditorFeatureListeners } from "./editorFeatures.js";
import { installGameState } from "../../GameState/GameState.js";
import { events, requestUiUpdate, Events } from "../../Core/EventSystem.js";
import { registerCoreListeners } from "../../Core/GameListeners.js";
import { PauseManager } from "../../Core/PauseManager.js";
import { setActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { bootstrapEngine } from "../../Core/bootstrapEngine.js";
import { applyGameCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { applyGamePropPixelSize } from "../../Core/GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "../../Core/GamePropQuantizeSettings.js";
import { mountGameUi } from "../../UI/Core/uiRoot.js";
import { editorGame, initEditorSession } from "./index.js";
import { tilelabUiPort } from "./ui/tilelabUiPort.js";
import { renderTilelabPreview } from "./ui/preview.js";
import { readControls } from "./ui/toolbar.js";
/** Editor boot — shared engine setup and loop. */
export function createEditorApp() {
    setActiveGameDefinition(editorGame);
    composeEditorProfile(editorGame);
    const state = editorGame.createGameState();
    initEditorFeatureState(state);
    installGameState(state);
    prepareEditorFeatures();
    editorGame.prepare?.();
    bootstrapEngine(editorGame);
    applyGameCollisionSettings(editorGame);
    applyGamePropQuantizeSettings(editorGame);
    applyGamePropPixelSize(editorGame);
    const viewport = state.viewport;
    const simulation = editorGame.simulationPort;
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
        editorGame.onCanvasResize?.();
    }
    registerCoreListeners(events, pauseManager, editorGame);
    registerEditorFeatureListeners(events);
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
