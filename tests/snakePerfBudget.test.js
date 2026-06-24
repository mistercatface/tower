import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performance } from "node:perf_hooks";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSpawnSpecs } from "../Libraries/Game/snake/snakeGameConfig.js";
import { wireSnakeTestGame, createWiredSnakeAutosim, createSnakeNavWalkable, registerSnakeTestInstance } from "./harness/snakeGameHarness.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { beginSnakePerceptionFrame, endSnakePerceptionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { getVisionFullBuildCount, resetVisionFullBuildCount } from "../Libraries/Navigation/perception/observerVisionFrame.js";
import { HPA_REPLAN_PEAK_INFLIGHT_CAP } from "../Libraries/Pathfinding/hpaReplanPolicy.js";
import { FRAME_MS } from "./frameMs.js";
/** Brain-on baseline — raise only when intentionally adding cost. */
const PERF_TICKS = 120;
const PERF_DT = FRAME_MS;
const WALL_CLOCK_MS_CEILING = 18_000;
const REPLAN_REQUEST_CEILING = 2000;
async function createPerfState(cols = 48, rows = 48) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    let replanRequests = 0;
    const testNav = await createWorkerNavigation(grid);
    testNav.settings = { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000 };
    const origReplan = testNav.session.requestReplan.bind(testNav.session);
    testNav.session.requestReplan = (...args) => {
        replanRequests++;
        return origReplan(...args);
    };
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: testNav,
        viewport: {
            snapTo() {},
            circleInBounds() {
                return false;
            },
        },
        get replanRequests() {
            return replanRequests;
        },
    };
    const hpaBehavior = createHpaGroundNavBehavior(state);
    const directBehavior = createDirectGroundNavBehavior(state);
    state.sandbox.controller = {
        getBehaviorByIdMap: () =>
            new Map([
                [HPA_GROUND_NAV_BEHAVIOR_ID, hpaBehavior],
                [DIRECT_GROUND_NAV_BEHAVIOR_ID, directBehavior],
            ]),
    };
    return state;
}
function buildMultiSnakeSession(state) {
    const config = getSnakeGameConfig();
    const behaviorById = state.sandbox.controller.getBehaviorByIdMap();
    const { snakeGame } = wireSnakeTestGame(state);
    const autosims = [];
    let excludeIndices = null;
    const specs = resolveSnakeSpawnSpecs(config);
    for (let i = 0; i < specs.length; i++) {
        const col = 4 + (i % 8) * 3;
        const row = 4 + Math.floor(i / 8) * 3;
        const pack = spawnSnakeChain(state, { col, row }, { excludeIndices, segmentCount: specs[i].segmentCount, rng: () => (i * 0.13) % 1 });
        excludeIndices = pack.occupiedIndices;
        registerSnakeTestInstance(state, state.sandbox.snakeGame, {
            headId: pack.chain.head.id,
            spawnGroupId: pack.chain.spawnGroupId,
        });
        const autosim = createWiredSnakeAutosim(state, { headId: pack.chain.head.id, behaviorById, rng: () => ((i + 1) * 0.17) % 1 });
        autosim.start();
        autosims.push({ autosim, head: pack.chain.head });
    }
    return { autosims };
}
describe("snakePerfBudget", () => {
    it("50 snakes with brains stay within wall-clock and replan budget", async () => {
        applySnakeGameConfig({ snakeCount: 50, brainSyncOffScreenInterval: 4 });
        resetKineticConstraintIds(1);
        resetVisionFullBuildCount();
        const state = await createPerfState();
        state.nav.session.resetPeakInflightReplans();
        const { autosims } = buildMultiSnakeSession(state);
        const snakeGame = state.sandbox.snakeGame;
        const aliveSnakes = autosims.length;
        const t0 = performance.now();
        for (let tick = 0; tick < PERF_TICKS; tick++) {
            snakeGame._batchingPerception = true;
            beginSnakePerceptionFrame(state);
            for (let i = 0; i < autosims.length; i++) autosims[i].autosim.tick(PERF_DT);
            endSnakePerceptionFrame(state);
            snakeGame._batchingPerception = false;
        }
        const elapsed = performance.now() - t0;
        const visionFullBuilds = getVisionFullBuildCount();
        assert.ok(elapsed < WALL_CLOCK_MS_CEILING, `wall-clock ${elapsed.toFixed(1)}ms exceeds ${WALL_CLOCK_MS_CEILING}ms`);
        assert.ok(state.replanRequests <= REPLAN_REQUEST_CEILING, `replan requests ${state.replanRequests} exceed ${REPLAN_REQUEST_CEILING}`);
        assert.ok(visionFullBuilds <= aliveSnakes * PERF_TICKS, `vision full builds ${visionFullBuilds} exceed ${aliveSnakes} snakes × ${PERF_TICKS} ticks`);
        assert.ok(
            state.nav.session.getPeakInflightReplans() <= HPA_REPLAN_PEAK_INFLIGHT_CAP,
            `peak in-flight replans ${state.nav.session.getPeakInflightReplans()} exceed ${HPA_REPLAN_PEAK_INFLIGHT_CAP}`,
        );
        applySnakeGameConfig();
    });
});
