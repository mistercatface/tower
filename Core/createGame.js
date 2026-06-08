import { installGameState } from "../GameState/GameState.js";
import { applyGameBootstrap } from "../Libraries/Bootstrap/applyGameBootstrap.js";
import { getRenderPorts, resetRun } from "./GamePorts.js";
import { events, requestUiUpdate } from "./EventSystem.js";
import { registerCoreListeners } from "./GameListeners.js";
import { PauseManager } from "./PauseManager.js";
import { Renderer } from "../Render/Render.js";
import { SimulationViewport } from "../Render/SimulationViewport.js";
import { StateMachine } from "../Libraries/FSM/StateMachine.js";
import { setActiveGameDefinition } from "./ActiveGameDefinition.js";
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
    const state = definition.createGameState();
    installGameState(state);
    definition.prepare?.();
    bootstrapEngine(definition);
    applyGameCollisionSettings(definition);
    applyGamePropQuantizeSettings(definition);
    applyGamePropPixelSize(definition);
    const canvas = document.getElementById(definition.canvasId);
    if (!canvas) throw new Error(`createGame: canvas #${definition.canvasId} not found`);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const renderer = new Renderer(canvas, ctx, definition.caches);
    const viewport = new SimulationViewport(0, 0);
    const stateMachineContext = { state, viewport, renderer };
    const fsm = new StateMachine(stateMachineContext);
    stateMachineContext.fsm = fsm;
    state.fsm = fsm;
    for (const [name, StateClass] of Object.entries(definition.states)) fsm.addState(name, new StateClass());
    const pauseManager = new PauseManager(state);
    function loop(timestamp) {
        if (state.lastTime === 0) state.lastTime = timestamp;
        let dt = timestamp - state.lastTime;
        state.lastTime = timestamp;
        dt = Math.min(dt, 50);
        if (!state.isGameOver) {
            state.scheduler.update(dt);
            if (!state.isPaused) {
                state.gameTime += dt * state.selectedSpeed;
                fsm.update(dt * state.selectedSpeed);
            }
        }
        fsm.render();
        requestAnimationFrame(loop);
    }
    function resetGame() {
        state.scheduler.clear();
        state.isGameOver = false;
        resetRun(state);
        pauseManager.reset();
        viewport.snapTo(0, 0);
        fsm.transition(definition.initialState);
        requestUiUpdate();
        requestAnimationFrame(loop);
    }
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        state.canvasBounds = { width: canvas.width, height: canvas.height };
        viewport.setCanvasSize(canvas.width, canvas.height);
        getRenderPorts().worldStructure.invalidate("viewport");
        definition.onCanvasResize?.();
    }
    registerCoreListeners(events, pauseManager);
    definition.registerListeners?.(events, { state, fsm, resetGame });
    applyGameBootstrap({ definition, state, events, pauseManager, canvas, fsm, viewport, resetGame, resizeCanvas });
}
