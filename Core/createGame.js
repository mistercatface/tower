import { state } from "../GameState/GameState.js";
import { initializeSaveSystem, loadProgress } from "../Progression/Storage.js";
import { loadPersistentTriggers } from "./PersistentTriggers.js";
import { initUI, registerUiEventListeners } from "../UI/UI.js";
import { events, requestUiUpdate, requestUiHudUpdate, showGameOver, hideGameOver, requestGamePause, requestGameResume } from "./EventSystem.js";
import { registerAllListeners } from "./GameListeners.js";
import { PauseManager } from "./PauseManager.js";
import { Renderer } from "../Render/Render.js";
import { CombatViewport } from "../Render/CombatViewport.js";
import { InputManager } from "./InputManager.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { GameStateMachine } from "../GameState/GameStateMachine.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { preloadAllInspectAssets } from "../Libraries/Inspect/InspectCatalog.js";
import { setActiveGameDefinition } from "./ActiveGameDefinition.js";

/** @typedef {import("../Games/tower/gameDefinition.js").GameDefinition} GameDefinition */

/**
 * Bootstrap a game from a definition manifest (FSM, loop, listeners, UI).
 *
 * @param {GameDefinition} definition
 */
export function createGame(definition) {
    setActiveGameDefinition(definition);
    definition.prepare?.();
    const canvas = document.getElementById(definition.canvasId);
    if (!canvas) throw new Error(`createGame: canvas #${definition.canvasId} not found`);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const renderer = new Renderer(canvas, ctx);
    const upgrades = definition.createUpgrades();
    const viewport = new CombatViewport(0, 0);
    const uiSnapshot = { health: -1, isMoving: false };
    const stateMachineContext = { state, upgrades, viewport, renderer, game: definition };
    const fsm = new GameStateMachine(stateMachineContext);
    stateMachineContext.fsm = fsm;
    state.fsm = fsm;
    for (const [name, StateClass] of Object.entries(definition.states)) {
        fsm.addState(name, new StateClass());
    }
    const pauseManager = new PauseManager(state);

    function didPlayerStateChange() {
        if (state.player.health !== uiSnapshot.health || state.player.isMoving !== uiSnapshot.isMoving) {
            uiSnapshot.health = state.player.health;
            uiSnapshot.isMoving = state.player.isMoving;
            return true;
        }
        return false;
    }

    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        if (state.player.health > 0) {
            state.scheduler.update(dt);
            if (!state.isPaused) {
                state.gameTime += dt * state.selectedSpeed;
                fsm.update(dt * state.selectedSpeed);
            }
            fsm.render();
            requestUiHudUpdate();
            if (didPlayerStateChange()) requestUiUpdate();
            requestAnimationFrame(loop);
        } else if (!state.isGameOver) {
            state.isGameOver = true;
            fsm.render();
            showGameOver();
            requestUiUpdate();
            requestUiHudUpdate();
        }
    }

    function resetGame() {
        StatsManager.resetRun(state, upgrades);
        initializeSaveSystem(state);
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
        inspectBridge.resize();
    }

    events.setContext({ state, upgrades, viewport, fsm, resetGame });
    events.warnOnMissingListeners = true;
    registerAllListeners(events, pauseManager);
    definition.wireRadio?.(events, { requestPause: requestGamePause, requestResume: requestGameResume });
    registerUiEventListeners(events);
    window.addEventListener("resize", resizeCanvas);
    window.gameState = state;
    StatsManager.initUpgradesList(state, upgrades);
    loadProgress(state, upgrades);
    loadPersistentTriggers();
    initializeSaveSystem(state);
    initUI(state, upgrades);
    inspectBridge.mount();
    definition.registerInspect?.();
    preloadAllInspectAssets();
    resizeCanvas();
    InputManager.setup(canvas, fsm);
    resetGame();
}
