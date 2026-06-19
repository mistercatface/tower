import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performance } from "node:perf_hooks";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { HpaPathSession } from "../Libraries/Pathfinding/HpaPathSession.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSpawnSpecs } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { spawnSnakeChain, spawnSnakeGoalPool } from "../Libraries/Game/snake/snakeScene.js";
loadPropAssets();
/** Brain-on baseline — raise only when intentionally adding cost. */
const PERF_TICKS = 120;
const PERF_DT = 1 / 60;
const WALL_CLOCK_MS_CEILING = 12_000;
const REPLAN_REQUEST_CEILING = 800;
function createPerfState(cols = 48, rows = 48) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    let replanRequests = 0;
    const mockWorker = { getPathSlot: () => -1, releaseOwnedPathSlot: () => {}, releaseSlot: () => {}, requestPath: async () => ({ result: { pathLen: 0, pathSlot: -1, pathProgressIdx: 0 } }) };
    const hpaPathSession = new HpaPathSession(mockWorker);
    const origReplan = hpaPathSession.requestReplan.bind(hpaPathSession);
    hpaPathSession.requestReplan = (...args) => {
        replanRequests++;
        return origReplan(...args);
    };
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: { obstacleGeneration: 0, settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 30, idlePathReplanMs: 5000 }, onObstaclesChanged: async () => {} },
        hpaPathWorker: mockWorker,
        hpaPathSession,
        viewport: {
            snapTo() {},
            isVisible(_x, _y, _pad) {
                return false;
            },
            boundsVisibleWide: { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 },
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
    const autosims = [];
    let excludeKeys = null;
    const specs = resolveSnakeSpawnSpecs(config);
    for (let i = 0; i < specs.length; i++) {
        const col = 4 + (i % 8) * 3;
        const row = 4 + Math.floor(i / 8) * 3;
        const pack = spawnSnakeChain(state, { col, row }, { excludeKeys, segmentCount: config.segmentCount, rng: () => (i * 0.13) % 1 });
        excludeKeys = pack.occupiedKeys;
        const autosim = createSnakeAutosim(state, { headId: pack.chain.head.id, behaviorById, rng: () => ((i + 1) * 0.17) % 1 });
        autosim.start();
        autosims.push({ autosim, head: pack.chain.head, isPlayer: specs[i].cameraFollow });
    }
    spawnSnakeGoalPool(state, config.goalCount, { excludeKeys, rng: () => 0.42 });
    return { autosims, hpaBehavior: behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID) };
}
describe("snakePerfBudget", () => {
    it("30 snakes with brains stay within wall-clock and replan budget", () => {
        applySnakeGameConfig({ snakeCount: 500, goalCount: 75, showAllSnakeVisionCones: false, brainSyncOffScreenInterval: 4 });
        resetKineticConstraintIds(1);
        const state = createPerfState();
        const { autosims, hpaBehavior } = buildMultiSnakeSession(state);
        const t0 = performance.now();
        for (let tick = 0; tick < PERF_TICKS; tick++) {
            for (let i = 0; i < autosims.length; i++) autosims[i].autosim.tick(PERF_DT);
            hpaBehavior.tickWorld(PERF_DT);
        }
        const elapsed = performance.now() - t0;
        assert.ok(elapsed < WALL_CLOCK_MS_CEILING, `wall-clock ${elapsed.toFixed(1)}ms exceeds ${WALL_CLOCK_MS_CEILING}ms`);
        assert.ok(state.replanRequests <= REPLAN_REQUEST_CEILING, `replan requests ${state.replanRequests} exceed ${REPLAN_REQUEST_CEILING}`);
        applySnakeGameConfig();
    });
});
