import { isInspector } from "../../GameState/GamePhase.js";
import {
    findInspectCollectPickup,
    getInspectCollectMissionBanner,
    handleInspectCollectClose,
    handleInspectCollectOpen,
    isInspectCollectActive,
} from "../../Libraries/RunScene/behaviors/inspectCollect.js";
import { runSceneController } from "./config/runScenes.js";

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onCombatEnter(ctx) {
    const { state } = ctx;

    if (!state.runSceneInitialized) {
        runSceneController.reset();
        const startSceneId = ctx.game?.startRunAtScene ?? null;
        runSceneController.startAt(startSceneId, state, ctx);
        state.runSceneInitialized = true;
    }

    runSceneController.enterCurrentScene(state, ctx, { applySpawn: true });
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onRunSceneTick(ctx, _dt) {
    runSceneController.tick(ctx.state, ctx);
}

export function onCombatEnemyKilled(payload) {
    runSceneController.onEnemyKilled(payload);
}

export function canRunHordeSpawning(_state) {
    return runSceneController.getCurrentCapabilities().horde === true;
}

export function blocksTurretTargeting(_state) {
    return runSceneController.getCurrentCapabilities().blockTurret === true;
}

export function getInspectMissionBanner(state) {
    if (!isInspector(state.phase)) return { show: false, text: "" };
    return getInspectCollectMissionBanner(state);
}

export function findInspectorInspectPickup(state, worldX, worldY) {
    return findInspectCollectPickup(state, worldX, worldY);
}

export function onInspectMissionOpen(state, inspectKey) {
    handleInspectCollectOpen(state, inspectKey);
}

export function onInspectMissionClose(state, inspectKey) {
    handleInspectCollectClose(state, inspectKey);
}

export function isInspectMissionActive(state) {
    return isInspectCollectActive(state);
}
