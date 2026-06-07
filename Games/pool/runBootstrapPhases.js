/** @typedef {import("../../Libraries/RunBootstrap/RunBootstrapPipeline.js").RunBootstrapPhase} RunBootstrapPhase */
/** @type {RunBootstrapPhase} */
export const initPoolRunStatePhase = {
    run(ctx) {
        const { state } = ctx;
        state.scheduler.clear();
        state.lastTime = 0;
        state.gameTime = 0;
        state.isGameOver = false;
        state.isPaused = false;
        state.selectedSpeed = 1.0;
        state.radioSeenThisRun = {};
        state.skipSimulationEnterReset = false;
        state.runSceneInitialized = false;
        state.poolBallsSpawned = false;
        state.pool = null;
    },
};
