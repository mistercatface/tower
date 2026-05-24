import { state } from "./GameState/GameState.js";
import { createUpgrades, createBaseUpgrades } from "./Upgrades.js";
import { loadProgress } from "./Storage.js";
import { initUI, updateUI, updateHud } from "./UI.js";
import { Renderer } from "./Render/Render.js";
import { Viewport } from "./Render/Viewport.js";
import { InputManager } from "./InputManager.js";
import { ProgressionManager } from "./ProgressionManager.js";
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

const stateMachineContext = { state, upgrades, viewport, renderer, updateUI };

const fsm = new GameStateMachine(stateMachineContext);
fsm.addState("map", new MapState());
fsm.addState("map_transition", new MapTransitionState());
fsm.addState("combat", new CombatState());
fsm.addState("reward", new RewardState());

function resetGame() {
    state.resetRun(upgrades);
    gameOverUI.style.display = "none";
    viewport.snapTo(0, 0);
    fsm.transition("map_transition");
    ProgressionManager.setupNewRunAbilities(state, upgrades);
    updateUI(state, upgrades);
    requestAnimationFrame(loop);
}

function didPlanetStateChange() {
    if (state.planet.health !== uiSnapshot.health || state.planet.isMoving !== uiSnapshot.isMoving) {
        uiSnapshot.health = state.planet.health;
        uiSnapshot.isMoving = state.planet.isMoving;
        return true;
    }
    return false;
}

function loop(timestamp) {
    if (state.lastTime === 0) state.lastTime = timestamp;
    let dt = timestamp - state.lastTime;
    state.lastTime = timestamp;
    dt = Math.min(dt, 50);
    if (state.planet.health > 0) {
        if (fsm.currentStateName !== state.phase) fsm.transition(state.phase);
        if (!state.isPaused) fsm.update(dt * state.selectedSpeed);
        fsm.render();
        updateHud(state, upgrades);
        if (didPlanetStateChange()) updateUI(state, upgrades);
        requestAnimationFrame(loop);
    } else if (!state.isGameOver) {
        state.isGameOver = true;
        fsm.render();
        gameOverUI.style.display = "flex";
        updateUI(state, upgrades);
        updateHud(state, upgrades);
    }
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    state.canvasBounds = { width: canvas.width, height: canvas.height };
    const uiContainer = document.getElementById("uiContainer");
    const uiHeight = uiContainer ? uiContainer.offsetHeight : 0;
    state.planet.setSpawnPosition(Math.floor(canvas.width / 2), Math.floor((canvas.height - uiHeight) / 2));
    viewport.cx = Math.floor(canvas.width / 2);
    viewport.cy = Math.floor((canvas.height - uiHeight) / 2);
}

window.addEventListener("resize", resizeCanvas);
window.gameState = state;
state.initUpgradesList(upgrades);
loadProgress(state, upgrades);
initUI(state, upgrades, resetGame);
gameOverUI = document.getElementById("gameOverUI");
resizeCanvas();
InputManager.setup(canvas, fsm, viewport);
resetGame();