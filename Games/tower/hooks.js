import { isInspector } from "../../GameState/GamePhase.js";
import { getClueSearchMissionLabel, findClueSearchPickup } from "./tutorial/ClueSearch.js";
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

    runSceneController.enterCurrentScene(state, ctx);
}

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onRunSceneTick(ctx, _dt) {
    runSceneController.tick(ctx.state, ctx);
}

export function onCombatEnemyKilled(payload) {
    runSceneController.onEnemyKilled(payload);
}

export function canRunHordeSpawning(_state) {
    return runSceneController.getCurrentSceneId() === "main_combat";
}

export function getInspectMissionBanner(state) {
    const show = isInspector(state.phase) && state.clueSearchActive;
    return { show, text: show ? getClueSearchMissionLabel(state) : "" };
}

export function findInspectorInspectPickup(state, worldX, worldY) {
    return findClueSearchPickup(state, worldX, worldY);
}
