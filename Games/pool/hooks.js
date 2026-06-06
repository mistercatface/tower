import { ensureRunScene } from "../../Libraries/RunScene/runSceneState.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { poolRunScenePorts } from "./runScenePorts.js";
import { hideArenaPlayer } from "./arenaPlayer.js";
import { spawnPoolBalls, ensurePoolState } from "./balls.js";
import { processPockets } from "./pockets.js";
function clearNonPoolPickups(state) {
    if (!state.pickups) return;
    state.pickups.length = 0;
}
/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onSimulationEnter(ctx) {
    const { state } = ctx;
    hideArenaPlayer(state.player);
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
    if (pool.won && !runScene.match?.won) runScene.match = { won: true };
    runSceneController.tick(state, ctx);
}
