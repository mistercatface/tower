import { state } from "./GameState/GameState.js";
import { createUpgrades } from "./Upgrades.js";
import { loadProgress } from "./Storage.js";
import { initUI, updateUI, updateHud } from "./UI.js";
import { Renderer } from "./Renderer.js";
import { Viewport } from "./Viewport.js";
import { InputManager } from "./InputManager.js";
import { ProgressionManager } from "./ProgressionManager.js";
import { GameStateMachine } from "./GameState/GameStateMachine.js";
import { MapState, MapTransitionState, CombatState, RewardState } from "./GameState/GameStates.js";

const canvas = document.getElementById("towerCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const renderer = new Renderer(canvas, ctx);
const upgrades = createUpgrades();
const viewport = new Viewport(0, 0);

let lastPlanetHealth = -1;
let lastIsMoving = false;

const stateMachineContext = {
    state,
    upgrades,
    viewport,
    renderer,
    updateUI
};

const fsm = new GameStateMachine(stateMachineContext);
fsm.addState("map", new MapState());
fsm.addState("map_transition", new MapTransitionState());
fsm.addState("combat", new CombatState());
fsm.addState("reward", new RewardState());
fsm.transition("map");

function resetGame() {
    state.resetRun(upgrades);
    upgrades.forEach((upg) => {
        if (upg.onRunStart && state.upgrades[upg.id] && state.upgrades[upg.id].baseLevel > 0) upg.onRunStart(state);
    });
    state.isTransitioning = false;
    state.waveTransitionTimer = 0;
    document.getElementById("gameOverUI").style.display = "none";
    upgrades.forEach((upg) => {
        upg.level = upg.baseLevel;
        upg.ptsCost = state.stats.baseUpgradeCost.value;
    });
    state.recalculateStats(upgrades);
    viewport.snapTo(0, 0);
    state.mapTargetNodeId = 0;
    state.phase = "map_transition";
    fsm.transition("map_transition");
    ProgressionManager.setupNewRunAbilities(state, upgrades);
    updateUI(state, upgrades);
    requestAnimationFrame(loop);
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
        if (state.planet.health !== lastPlanetHealth || state.planet.isMoving !== lastIsMoving) {
            updateUI(state, upgrades);
            lastPlanetHealth = state.planet.health;
            lastIsMoving = state.planet.isMoving;
        }
        requestAnimationFrame(loop);
    } else if (!state.isGameOver) {
        state.isGameOver = true;
        fsm.render();
        document.getElementById("gameOverUI").style.display = "flex";
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
resizeCanvas();
InputManager.setup(canvas, state, viewport, upgrades);
resetGame();