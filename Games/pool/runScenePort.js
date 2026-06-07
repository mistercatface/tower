import { ensureRunScene } from "../../Libraries/RunScene/runSceneState.js";
import { spawnPoolBalls, ensurePoolState } from "./balls.js";
import { getStartRunAtScene, runSceneController } from "./config/runScenes.js";
import { processPockets } from "./pockets.js";
import { poolRunScenePorts } from "./runScenePorts.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").RunScenePort} RunScenePort */
function clearNonPoolPickups(state) {
    if (!state.pickups) return;
    state.pickups.length = 0;
}
/** @type {RunScenePort} */
export const poolRunScenePort = {
    ports: poolRunScenePorts,
    getLayout(state) {
        return poolRunScenePorts.getLayout(state);
    },
    onSimulationEnter(ctx) {
        const { state } = ctx;
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
            spawnPoolBalls(state, poolRunScenePorts.getLayout(state));
            state.poolBallsSpawned = true;
        }
    },
    onTick(ctx, _dt) {
        const { state } = ctx;
        const layout = poolRunScenePorts.getLayout(state);
        const runScene = ensureRunScene(state);
        processPockets(state, layout);
        const pool = ensurePoolState(state);
        if (pool.won && !runScene.match?.won) runScene.match = { won: true };
        runSceneController.tick(state, ctx);
    },
    getCapabilities(_state) {
        return { horde: false, blockTurret: false };
    },
};
