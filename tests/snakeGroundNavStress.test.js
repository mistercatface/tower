// Deep local run: NAV_STRESS_STEPS=200 NAV_STRESS_SEEDS=1,42,1337,9999 node scripts/run-tests.mjs tests/snakeGroundNavStress.test.js
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { terminateWorkerNavigation, enableTestNavigationTracking, terminateAllWorkerNavigations } from "./WorkerNavigationFactory.js";
import {
    mulberry32,
    createSnakeNavStressState,
    assertSnakeLaunchReady,
    boidOpenCellIdx,
    pickRandomReachableTargetWorld,
    breakRandomWall,
    requestSnakeGroundNavReplan,
    moveStressBoidToTarget,
    formatReplanFailureDiagnostics,
    stressStepsFromEnv,
    stressSeedsFromEnv,
} from "./harness/snakeNavStressHarness.js";

enableTestNavigationTracking();

after(async () => {
    await terminateAllWorkerNavigations();
});

async function runStressSteps(state, prop, seed, steps, breakRate) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let step = 0; step < steps; step++) {
        if (breakRate > 0 && rng() < breakRate) await breakRandomWall(state, rng);
        await state.nav.awaitWorkerNavReady();
        const startIdx = boidOpenCellIdx(state, prop);
        const targetWorld = pickRandomReachableTargetWorld(state, startIdx, rng, prop);
        assert.ok(targetWorld != null, `no reachable target at seed=${seed} step=${step} startIdx=${startIdx}`);
        const pathLen = await requestSnakeGroundNavReplan(state, prop, targetWorld);
        assert.ok(
            pathLen > 0,
            formatReplanFailureDiagnostics(state, { seed, step, startIdx, targetIdx: targetWorld.idx, clickIdx: targetWorld.clickIdx, targetWorld, prop }),
        );
        moveStressBoidToTarget(prop, targetWorld);
    }
}

describe("snake ground nav stress", () => {
    it("smoke single replan on snake maze", async () => {
        const seed = 42;
        const { state, boid } = await createSnakeNavStressState(seed);
        assertSnakeLaunchReady(state);
        await state.nav.awaitWorkerNavReady();
        const startIdx = boidOpenCellIdx(state, boid);
        const targetWorld = pickRandomReachableTargetWorld(state, startIdx, mulberry32(seed), boid);
        assert.ok(targetWorld != null);
        const pathLen = await requestSnakeGroundNavReplan(state, boid, targetWorld);
        assert.ok(
            pathLen > 0,
            formatReplanFailureDiagnostics(state, { seed, step: 0, startIdx, targetIdx: targetWorld.idx, targetWorld, prop: boid }),
        );
        await terminateWorkerNavigation(state.nav);
    });

    it("sequential random targets without breaks", async () => {
        const seed = 42;
        const steps = stressStepsFromEnv(12);
        const { state, boid } = await createSnakeNavStressState(seed);
        assertSnakeLaunchReady(state);
        await runStressSteps(state, boid, seed, steps, 0);
        await terminateWorkerNavigation(state.nav);
    });

    it("random targets and wall breaks across seeds", async () => {
        const seeds = stressSeedsFromEnv([42, 1337]);
        const steps = stressStepsFromEnv(15);
        for (const seed of seeds) {
            const { state, boid } = await createSnakeNavStressState(seed);
            assertSnakeLaunchReady(state);
            await runStressSteps(state, boid, seed, steps, 0.35);
            await terminateWorkerNavigation(state.nav);
        }
    });

    it("wall break then immediate replan every step", async () => {
        const seed = 99;
        const steps = stressStepsFromEnv(10);
        const { state, boid } = await createSnakeNavStressState(seed);
        assertSnakeLaunchReady(state);
        await runStressSteps(state, boid, seed, steps, 1);
        await terminateWorkerNavigation(state.nav);
    });
});
