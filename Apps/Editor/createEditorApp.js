import { applyGameFeatures } from "../../Core/applyGameFeatures.js";
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
    applyGameFeatures(editorGame);
    const state = editorGame.createGameState();
    for (const feature of editorGame.features ?? []) feature.initState?.(state);
    installGameState(state);
    for (const feature of editorGame.features ?? []) feature.prepare?.();
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
        if (!state.isGameOver) {
            state.scheduler.update(dt);
            if (!state.isPaused) {
                state.gameTime += dt * state.selectedSpeed;
                tickSimulation(dt * state.selectedSpeed);
            }
        }
        drawFrame();
        requestAnimationFrame(loop);
    }
    function resetEditor() {
        state.scheduler.clear();
        state.isGameOver = false;
        pauseManager.reset();
        viewport.snapTo(0, 0);
        enterEditor();
        requestUiUpdate();
        requestAnimationFrame(loop);
    }
    function enterEditor() {
        initEditorSession({ state });
        requestUiUpdate();
    }
    function resizeCanvas() {
        editorGame.onCanvasResize?.();
    }
    registerCoreListeners(events, pauseManager);
    for (const feature of editorGame.features ?? []) feature.registerListeners?.(events, { state, fsm: null, resetGame: resetEditor });
    editorGame.registerListeners?.(events, { state, fsm: null, resetGame: resetEditor });
    events.setContext({ state, viewport, fsm: null, resetGame: resetEditor });
    events.warnOnMissingListeners = true;
    events.on(Events.UI_UPDATE, ({ state: uiState }) => {
        tilelabUiPort.updateUI({ state: uiState });
    });
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    mountGameUi(tilelabUiPort, state);
    resizeCanvas();
    enterEditor();
    requestAnimationFrame(loop);
}
