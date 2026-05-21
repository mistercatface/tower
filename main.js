import { state } from "./GameState.js";
import { Projectile } from "./Entities.js";
import { FloatingText } from "./FloatingText.js";
import { Enemy } from "./Enemy.js";
import { createUpgrades } from "./Upgrades.js";
import { loadProgress, saveProgress } from "./Storage.js";
import { initUI, updateUI, updateHud } from "./UI.js";
import { Renderer } from "./Renderer.js";
import { CollisionSystem, SpatialHash } from "./CollisionSystem.js";
import { Viewport } from "./Viewport.js";
import { WallGenerator } from "./Generator.js";
import { CombatManager } from "./CombatManager.js";
import { WaveManager } from "./WaveManager.js";
import { InputManager } from "./InputManager.js";
import { ProgressionManager } from "./ProgressionManager.js";
import { WeaponSystem } from "./WeaponSystem.js";

const canvas = document.getElementById("towerCanvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const renderer = new Renderer(canvas, ctx);
const upgrades = createUpgrades();
const viewport = new Viewport(0, 0);

let lastPlanetHealth = -1;
let lastIsMoving = false;

function resetGame() {
    state.resetRun(upgrades);
    upgrades.forEach((upg) => {
        if (upg.onRunStart && state.upgrades[upg.id] && state.upgrades[upg.id].baseLevel > 0) {
            upg.onRunStart(state);
        }
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
        if (!state.isPaused) update(dt * state.selectedSpeed);
        draw();
        updateHud(state, upgrades);
        if (state.planet.health !== lastPlanetHealth || state.planet.isMoving !== lastIsMoving) {
            updateUI(state, upgrades);
            lastPlanetHealth = state.planet.health;
            lastIsMoving = state.planet.isMoving;
        }
        requestAnimationFrame(loop);
    } else if (!state.isGameOver) {
        state.isGameOver = true;
        draw();
        document.getElementById("gameOverUI").style.display = "flex";
        updateUI(state, upgrades);
        updateHud(state, upgrades);
    }
}

function draw() {
    if (state.phase === "map" || state.phase === "map_transition") {
        viewport.follow(state.mapPlayerX, state.mapPlayerY - 200);
    } else {
        viewport.follow(state.planet.x, state.planet.y);
    }
    renderer.render(state, viewport);
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

function update(dt) {
    if (state.phase === "map" || state.phase === "reward") {
        FloatingText.updateAll(state, dt);
        return;
    }
    if (state.phase === "map_transition") {
        if (state.updateMapTransition(dt, viewport)) updateUI(state, upgrades);
        FloatingText.updateAll(state, dt);
        return;
    }
    const abilityState = ProgressionManager.updateAbilities(state, dt, upgrades);
    if (!abilityState.isDiving && state.planet.applyQueuedTarget()) state.gridSystem.buildPlayerFlowField(state.planet.targetX, state.planet.targetY);
    
    const spatialHash = new SpatialHash(50);
    for (const e of state.enemies) spatialHash.insert(e);
    spatialHash.insert(state.planet);
    const oldGridPos = state.gridSystem.worldToGrid(state.planet.x, state.planet.y);
    state.planet.update(dt, state.gridSystem, state.walls, spatialHash, abilityState.externalSpeedMod);
    const newGridPos = state.gridSystem.worldToGrid(state.planet.x, state.planet.y);
    if (oldGridPos.col !== newGridPos.col || oldGridPos.row !== newGridPos.row) state.gridSystem.buildFlowField(state.planet.x, state.planet.y);

    WaveManager.manageSpawning(dt, state, upgrades, viewport);
    Enemy.updateAll(state, dt, spatialHash);
    Projectile.updateAll(state, dt);
    ProgressionManager.updatePickups(state, dt, upgrades);
    const turretEvents = WeaponSystem.updateTurretAndWeapon(dt, abilityState.blocksTargeting, state, upgrades);
    const collisionEvents = CollisionSystem.run(state);
    const allEvents = [...turretEvents, ...collisionEvents];
    for (const event of allEvents) {
            if (event.type === "enemyHit") {
                CombatManager.handleEnemyHit(event.enemy, event.damage, state, upgrades);
            } else if (event.type === "planetHit") {
                CombatManager.handlePlanetHit(event.damage, state);
            } else if (event.type === "wallHit") {
                CombatManager.handleWallHit(event.segment, event.damage, state);
            }
        }
    FloatingText.updateAll(state, dt);
    upgrades.forEach((upg) => upg.update(dt, state));
    ProgressionManager.processLevelUps(state, upgrades);
}

window.addEventListener("resize", resizeCanvas);
window.gameState = state;
state.initUpgradesList(upgrades);
loadProgress(state, upgrades);
initUI(state, upgrades, resetGame);
resizeCanvas();
InputManager.setup(canvas, state, viewport, upgrades);
resetGame();
