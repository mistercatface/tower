import { state } from "../GameState/GameState.js";
import { initializeSaveSystem, loadProgress } from "../Progression/Storage.js";
import { loadPersistentTriggers } from "./PersistentTriggers.js";
import { initUI, registerUiEventListeners } from "../UI/UI.js";
import { events, requestUiUpdate, requestUiHudUpdate, showGameOver, showRunResult, hideGameOver, requestGamePause, requestGameResume } from "./EventSystem.js";
import { registerAllListeners } from "./GameListeners.js";
import { PauseManager } from "./PauseManager.js";
import { Renderer } from "../Render/Render.js";
import { SimulationViewport } from "../Render/SimulationViewport.js";
import { InputManager } from "./InputManager.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { GameStateMachine } from "../GameState/GameStateMachine.js";
import { inspectBridge } from "../Combat/inspect/InspectBridge.js";
import { preloadAllInspectAssets } from "../Libraries/Inspect/InspectCatalog.js";
import { setActiveGameDefinition } from "./ActiveGameDefinition.js";
import { applyGameShell, resolveUiProfile } from "./GameUiProfile.js";
import { applyChromeVisibility } from "./GameShell.js";
import { applyGamePerspective } from "./GamePerspective.js";
import { applyGamePropPixelSize } from "./GamePropPixelSize.js";
import { applyGameProceduralDesign } from "./GameProceduralDesign.js";

/** @typedef {import("./GameDefinitionTypes.js").GameDefinition} GameDefinition */

/**
 * Bootstrap a game from a definition manifest (FSM, loop, listeners, UI).
 *
 * @param {GameDefinition} definition
 */
export function createGame(definition) {
    setActiveGameDefinition(definition);
    definition.prepare?.();
    applyGameProceduralDesign(definition);
    applyGamePerspective(definition);
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

            const outcome = definition.getRunOutcome?.(state);
            if (outcome) {
                state.isGameOver = true;
                const copy = uiProfile.runResult?.[outcome];
                showRunResult({
                    outcome,
                    title: copy?.title ?? (outcome === "won" ? "YOU WIN" : "GAME OVER"),
                    buttonLabel: copy?.buttonLabel ?? "NEW RUN",
                    titleColor: copy?.titleColor ?? (outcome === "won" ? "#4CAF50" : "#F44336"),
                });
                requestUiUpdate();
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
    applyChromeVisibility();
    inspectBridge.mount();
    definition.registerInspect?.();
    preloadAllInspectAssets();
    resizeCanvas();
    InputManager.setup(canvas, fsm);
    resetGame();
}
