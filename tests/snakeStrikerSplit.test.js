import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { spawnSnakeStriker, resolveStrikerBallSnakeSplitsFromContacts } from "../Libraries/Game/snake/snakeStriker.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { evaluateInputGates } from "../Libraries/Sandbox/inputGates.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
import { DRAG_LAUNCH_WAIT_BEHAVIOR_ID } from "../Libraries/Sandbox/dragLaunch.js";

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
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} }, session: { isReplanInFlight: () => false }, topology: null },
        wallResolver: { resolve() {} },
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

function wireSnakeGame(state, registry, headId) {
    const autosimsByHeadId = new Map();
    autosimsByHeadId.set(headId, { stop() {} });
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
    return autosimsByHeadId;
}

describe("snake striker ball", () => {
    it("spawnSnakeStriker uses start radius and at-rest drag-launch gate", () => {
        applySnakeGameConfig({ startRadius: 2, strikerPropId: "snake_striker" });
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const striker = spawnSnakeStriker(state, snake.chain.head);
        assert.equal(striker.type, "snake_striker");
        assert.equal(striker.radius, 2);
        striker.vx = 40;
        striker.vy = 0;
        assert.equal(evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, striker, getPropAsset("snake_striker"), state).allowed, false);
        striker.vx = 0;
        striker.vy = 0;
        assert.equal(evaluateInputGates(DRAG_LAUNCH_WAIT_BEHAVIOR_ID, striker, getPropAsset("snake_striker"), state).allowed, true);
    });

    it("resolveStrikerBallSnakeSplitsFromContacts splits snake at struck segment above threshold", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, snake.chain.head.id);
        wireSnakeGame(state, registry, snake.chain.head.id);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        state.sandbox.snakeGame.strikerBall = striker;
        const struck = snake.chain.members[2];
        striker.vx = 90;
        striker.vy = 0;
        struck.vx = 0;
        struck.vy = 0;
        striker.x = struck.x - striker.radius - struck.radius + 1;
        striker.y = struck.y;
        const props = [...snake.chain.members, striker];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(registry.inertByLeadId.size, 1);
        assert.ok(getOrderedChainMemberIds(state, snake.chain.head.id).length >= 3);
    });

    it("resolveStrikerBallSnakeSplitsFromContacts ignores parked ball rammed by a fast snake", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, snake.chain.head.id);
        wireSnakeGame(state, registry, snake.chain.head.id);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        const head = snake.chain.head;
        striker.vx = 0;
        striker.vy = 0;
        head.vx = 90;
        head.vy = 0;
        head.x = striker.x - head.radius - striker.radius + 1;
        head.y = striker.y;
        const props = [...snake.chain.members, striker];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(getOrderedChainMemberIds(state, snake.chain.head.id).length, 5);
    });

    it("resolveStrikerBallSnakeSplitsFromContacts ignores impacts below threshold", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, snake.chain.head.id);
        wireSnakeGame(state, registry, snake.chain.head.id);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        const struck = snake.chain.members[2];
        striker.vx = 5;
        striker.vy = 0;
        struck.vx = 0;
        struck.vy = 0;
        striker.x = struck.x - striker.radius - struck.radius + 1;
        striker.y = struck.y;
        const props = [...snake.chain.members, striker];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(getOrderedChainMemberIds(state, snake.chain.head.id).length, 5);
    });
});
