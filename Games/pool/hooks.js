import { ensureRunScene } from "../../Libraries/RunScene/runSceneState.js";
import { isRadioDialogActive as isPoolRadioDialogActive } from "./wireRadio.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { poolRunScenePorts } from "./runScenePorts.js";
import { spawnPoolBalls, ensurePoolState } from "./balls.js";
import { processPockets } from "./pockets.js";

function hidePlayerForPool(player) {
    player.render = () => {};
    player.renderCombatHudClassic = () => {};
    player.desiredX = 0;
    player.desiredY = 0;
    player.vx = 0;
    player.vy = 0;
    player.isMoving = false;
    player.turrets = [];
    player.weaponLoadout = [];
}

function clearNonPoolPickups(state) {
    if (!state.pickups) return;
    state.pickups.length = 0;
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onCombatEnter(ctx) {
    const { state } = ctx;

    hidePlayerForPool(state.player);
    state.abilities = {};
    state.allies = [];

    if (!state.runSceneInitialized) {
        state.pool = null;
        runSceneController.reset();
        runSceneController.startAt(getStartRunAtScene(), state, ctx);
        state.runSceneInitialized = true;
        state.poolBallsSpawned = false;
    }

    runSceneController.enterCurrentScene(state, ctx, { applySpawn: true });

    if (!state.poolBallsSpawned) {
        clearNonPoolPickups(state);
        const layout = poolRunScenePorts.getLayout(state);
        spawnPoolBalls(state, layout);
        state.poolBallsSpawned = true;
    }
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onRunSceneTick(ctx, _dt) {
    const { state } = ctx;
    const layout = poolRunScenePorts.getLayout(state);
    const runScene = ensureRunScene(state);

    processPockets(state, layout);

    const pool = ensurePoolState(state);
    if (pool.won && !runScene.match?.won) {
        runScene.match = { won: true };
    }

    runSceneController.tick(state, ctx);
}

export function onCombatEnemyKilled() {}

export function canRunHordeSpawning() {
    return false;
}

export function blocksTurretTargeting() {
    return true;
}

export function getInspectMissionBanner() {
    return { show: false, text: "" };
}

export function findInspectorInspectPickup() {
    return null;
}

export function onInspectMissionOpen() {}

export function onInspectMissionClose() {}

export function isInspectMissionActive() {
    return false;
}

export function onRunOpeningComplete() {}

export function isRadioDialogActive() {
    return isPoolRadioDialogActive();
}
