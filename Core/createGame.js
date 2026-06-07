import { state } from "../GameState/GameState.js";
import { initializeSaveSystem } from "../Progression/Storage.js";
import { applyGameBootstrap } from "../Libraries/Bootstrap/applyGameBootstrap.js";
import { getBootstrapPort } from "./GamePorts.js";
import { events, requestUiUpdate, requestUiHudUpdate, showGameOver, hideGameOver } from "./EventSystem.js";
import { registerAllListeners } from "./GameListeners.js";
import { PauseManager } from "./PauseManager.js";
import { Renderer } from "../Render/Render.js";
import { SimulationViewport } from "../Render/SimulationViewport.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { GameStateMachine } from "../GameState/GameStateMachine.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { setActiveGameDefinition } from "./ActiveGameDefinition.js";
import { applyGameShell, resolveUiProfile } from "./GameUiProfile.js";
import { bootstrapEngine } from "./bootstrapEngine.js";
import { applyGameCollisionSettings } from "./GameCollisionSettings.js";
import { applyGamePropPixelSize } from "./GamePropPixelSize.js";
import { applyGamePropQuantizeSettings } from "./GamePropQuantizeSettings.js";
/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */
/**
 * Bootstrap a game from a definition manifest (FSM, loop, listeners, UI).
 *
 * @param {GameDefinition} definition
 */
export function createGame(definition) {
    setActiveGameDefinition(definition);
    definition.prepare?.();
    bootstrapEngine(definition);
    applyGameCollisionSettings(definition);
    applyGamePropQuantizeSettings(definition);
    applyGamePropPixelSize(definition);
    applyGameShell(definition);
    const canvas = document.getElementById(definition.canvasId);
    if (!canvas) throw new Error(`createGame: canvas #${definition.canvasId} not found`);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const renderer = new Renderer(canvas, ctx);
    const upgrades = definition.createUpgrades();
    const viewport = new SimulationViewport(0, 0);
    const uiSnapshot = { health: -1, isMoving: false };
    const stateMachineContext = { state, upgrades, viewport, renderer };
    const fsm = new GameStateMachine(stateMachineContext);
    stateMachineContext.fsm = fsm;
    state.fsm = fsm;
    for (const [name, StateClass] of Object.entries(definition.states)) fsm.addState(name, new StateClass());
    const pauseManager = new PauseManager(state);
    function didPlayerStateChange() {
        if (state.player.health !== uiSnapshot.health || state.player.isMoving !== uiSnapshot.isMoving) {
            uiSnapshot.health = state.player.health;
            uiSnapshot.isMoving = state.player.isMoving;
            return true;
        }
        return false;
    }
    const uiProfile = resolveUiProfile(definition);
    const customLifecycle = uiProfile.lifecycle === "custom";
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        const runActive = customLifecycle ? !state.isGameOver : state.player.health > 0;
        if (runActive) {
            state.scheduler.update(dt);
            if (!state.isPaused) {
                state.gameTime += dt * state.selectedSpeed;
                fsm.update(dt * state.selectedSpeed);
            }
        } else if (!state.isGameOver) {
            state.isGameOver = true;
            showGameOver();
            requestUiUpdate();
        }
        fsm.render();
        requestUiHudUpdate();
        if (didPlayerStateChange()) requestUiUpdate();
        requestAnimationFrame(loop);
    }
    function resetGame() {
        StatsManager.resetRun(state, upgrades);
        if (getBootstrapPort().features.save) initializeSaveSystem(state);
        pauseManager.reset();
        hideGameOver();
        viewport.snapTo(0, 0);
        fsm.transition(definition.initialState);
        requestUiUpdate();
        requestUiHudUpdate();
        requestAnimationFrame(loop);
    }
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        state.canvasBounds = { width: canvas.width, height: canvas.height };
        viewport.setCanvasSize(canvas.width, canvas.height);
        if (getBootstrapPort().features.inspect) inspectBridge.resize();
    }
    registerAllListeners(events, pauseManager);
    applyGameBootstrap({ definition, state, upgrades, events, pauseManager, canvas, fsm, viewport, resetGame, resizeCanvas });
}
