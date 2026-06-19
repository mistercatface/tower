import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeLifecycleRegistry, isAliveSnakeHead, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { splitSnakeAtStruckSegment, killSnake, enforceSnakeMinLength } from "../Libraries/Game/snake/snakeCombat.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createWiredSnakeAutosim, createSnakeNavWalkable } from "./harness/snakeGameHarness.js";

loadPropAssets();

function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
        hpaPathWorker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} },
    };
}

function snakeChainOptions(segmentCount) {
    const config = getSnakeGameConfig();
    return {
        segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
        exportType: SNAKE_CHAIN_EXPORT_TYPE,
    };
}

function mockSnakeGame(state, headIds) {
    const registry = createSnakeLifecycleRegistry();
    const autosimsByHeadId = new Map();
    const behaviorById = new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
    for (let i = 0; i < headIds.length; i++) {
        registerAliveSnake(registry, headIds[i]);
    }
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
    for (let i = 0; i < headIds.length; i++) {
        const autosim = createWiredSnakeAutosim(state, { headId: headIds[i], behaviorById, rng: () => 0 });
        autosim.start();
        autosimsByHeadId.set(headIds[i], autosim);
    }
    return { registry, autosimsByHeadId };
}

describe("snake split on impact", () => {
    it("getOrderedChainMemberIds walks head to tail", () => {
        applySnakeGameConfig({ segmentCount: 4 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(4));
        const ordered = getOrderedChainMemberIds(state, pack.chain.head.id);
        assert.equal(ordered.length, 4);
        assert.equal(ordered[0], pack.chain.head.id);
        assert.equal(ordered[3], pack.chain.tail.id);
    });

    it("split at middle segment severs tail into inert instance", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const members = getOrderedChainMemberIds(state, headId);
        const struckId = members[2];
        const result = splitSnakeAtStruckSegment(state, snakeGame, headId, struckId);
        assert.ok(result);
        assert.equal(result.aliveIds.length, 3);
        assert.equal(result.inertIds.length, 2);
        assert.equal(state.sandbox.kineticConstraints.length, 3);
        assert.ok(isAliveSnakeHead(snakeGame.registry, headId));
        assert.equal(snakeGame.registry.inertByLeadId.size, 1);
    });

    it("split that leaves too few segments kills the survivor", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const members = getOrderedChainMemberIds(state, headId);
        splitSnakeAtStruckSegment(state, snakeGame, headId, members[0]);
        assert.equal(isAliveSnakeHead(snakeGame.registry, headId), false);
        assert.equal(snakeGame.autosimsByHeadId.has(headId), false);
        assert.equal(state.sandbox.kineticConstraints.length, 1);
    });
});

describe("snake min length death", () => {
    it("enforceSnakeMinLength kills head-only chain", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(1));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.ok(enforceSnakeMinLength(state, snakeGame, headId));
        assert.equal(isAliveSnakeHead(snakeGame.registry, headId), false);
    });

    it("enforceSnakeMinLength kills head plus one segment", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(2));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.ok(enforceSnakeMinLength(state, snakeGame, headId));
        assert.equal(snakeGame.autosimsByHeadId.has(headId), false);
    });

    it("killSnake stops autosim and clears chain links", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.equal(state.sandbox.kineticConstraints.length, 2);
        killSnake(state, snakeGame, headId);
        assert.equal(state.sandbox.kineticConstraints.length, 0);
        assert.equal(snakeGame.autosimsByHeadId.has(headId), false);
    });
});
