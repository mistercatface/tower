import { state } from "./GameState/GameState.js";
import { createUpgrades, createBaseUpgrades } from "./Progression/Upgrades.js";
import { initializeSaveSystem, loadProgress } from "./Progression/Storage.js";
import { initUI } from "./UI/UI.js";
import { events, requestUiUpdate, requestUiHudUpdate } from "./Core/EventSystem.js";
import { FloatingText } from "./Render/FloatingText.js";
import { registerGameListeners } from "./Core/GameListeners.js";
import { PauseManager } from "./Core/PauseManager.js";
import { Renderer } from "./Render/Render.js";
import { Viewport } from "./Render/Viewport.js";
import { InputManager } from "./Core/InputManager.js";
import { ProgressionManager } from "./Progression/ProgressionManager.js";
import { StatsManager } from "./Progression/StatsManager.js";
import { GameStateMachine } from "./GameState/GameStateMachine.js";
import { MapState, MapTransitionState, CombatState, RewardState } from "./GameState/GameStates.js";

const canvas = document.getElementById("towerCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

let gameOverUI;

const renderer = new Renderer(canvas, ctx);
const upgrades = [...createBaseUpgrades(), ...createUpgrades()];
const viewport = new Viewport(0, 0);

const uiSnapshot = {
    health: -1,
    isMoving: false
};

const stateMachineContext = { state, upgrades, viewport, renderer };
const fsm = new GameStateMachine(stateMachineContext);
stateMachineContext.fsm = fsm;
state.fsm = fsm;
fsm.addState("map", new MapState());
fsm.addState("map_transition", new MapTransitionState());
fsm.addState("combat", new CombatState());
fsm.addState("reward", new RewardState());

const pauseManager = new PauseManager(state);

events.setContext({ state, upgrades, viewport, fsm });
FloatingText.registerEventListener(events);
registerGameListeners(events, pauseManager);

function resetGame() {
    StatsManager.resetRun(state, upgrades);

    initializeSaveSystem(state);
    pauseManager.reset();
    gameOverUI.style.display = "none";
    viewport.snapTo(0, 0);
    fsm.transition("map_transition");
    ProgressionManager.setupNewRunAbilities(state, upgrades);
    requestUiUpdate();
    requestAnimationFrame(loop);
}

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
        if (!state.isPaused) fsm.update(dt * state.selectedSpeed);
        fsm.render();
        requestUiHudUpdate();
        if (didPlayerStateChange()) requestUiUpdate();
        requestAnimationFrame(loop);
    } else if (!state.isGameOver) {
        state.isGameOver = true;
        fsm.render();
        gameOverUI.style.display = "flex";
        requestUiUpdate();
        requestUiHudUpdate();
    }
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    state.canvasBounds = { width: canvas.width, height: canvas.height };
    state.player.setSpawnPosition(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
    viewport.cx = Math.floor(canvas.width / 2);
    viewport.cy = Math.floor(canvas.height / 2);
}

window.addEventListener("resize", resizeCanvas);
window.gameState = state;
StatsManager.initUpgradesList(state, upgrades);
loadProgress(state, upgrades);
initializeSaveSystem(state);
initUI(state, upgrades, resetGame);
gameOverUI = document.getElementById("gameOverUI");
resizeCanvas();
InputManager.setup(canvas, fsm, viewport);
resetGame();