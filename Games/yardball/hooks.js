import { Pickup } from "../../Entities/Pickup.js";
import { ensureRunScene } from "../../Libraries/RunScene/runSceneState.js";
import { isRadioDialogActive as isYardballRadioDialogActive } from "./wireRadio.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { getYardballStartProps } from "./config/startProps.js";
import { yardballRunScenePorts } from "./runScenePorts.js";
import { getHeroBall, getGoalPosition, isBallInGoal, HERO_BALL_TAG } from "./ball.js";

function hidePlayerForYardball(player) {
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

function spawnHeroBall(state, layout) {
    for (const spec of getYardballStartProps(layout)) {
        const pickup = new Pickup(spec.x, spec.y, spec.type, spec.facing ?? null);
        pickup[HERO_BALL_TAG] = true;
        state.pickups.push(pickup);
    }
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onCombatEnter(ctx) {
    const { state } = ctx;

    hidePlayerForYardball(state.player);
    state.abilities = {};
    state.allies = [];

    if (!state.runSceneInitialized) {
        runSceneController.reset();
        runSceneController.startAt(getStartRunAtScene(), state, ctx);
        state.runSceneInitialized = true;
        state.yardballHeroSpawned = false;
    }

    runSceneController.enterCurrentScene(state, ctx, { applySpawn: true });

    if (!state.yardballHeroSpawned) {
        const layout = yardballRunScenePorts.getLayout(state);
        spawnHeroBall(state, layout);
        state.yardballHeroSpawned = true;
    }
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onRunSceneTick(ctx, _dt) {
    const { state } = ctx;
    const runScene = ensureRunScene(state);

    if (!runScene.goal?.reached) {
        const ball = getHeroBall(state);
        const goal = getGoalPosition(yardballRunScenePorts.getLayout(state));
        if (isBallInGoal(ball, goal)) {
            runScene.goal = { reached: true };
        }
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
    return isYardballRadioDialogActive();
}
