import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { killSnake } from "../Libraries/Game/snake/snakeCombat.js";
import { spawnSnakeStriker, resolveStrikerBallSnakeSplitsFromContacts } from "../Libraries/Game/snake/snakeStriker.js";
import { SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { gatherKineticConstraintSlab, resolveGatheredKineticConstraintSlab } from "../Libraries/Motion/kineticConstraintSolver.js";

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

function wireSnakeGame(state, snake) {
    wireSnakeTestGame(state, [{ headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId }]);
}

function snakeShards(state) {
    return state.worldProps.filter((prop) => prop.type === SNAKE_SHARD_PROP_ID);
}

describe("snake segment fracture", () => {
    it("dead snake segments are replaced by tinted kinetic polygon shards", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const originalIds = snake.chain.members.map((prop) => prop.id);
        const tint = getPropVisualTint(snake.chain.head);

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id);

        for (const id of originalIds) assert.equal(state.entityRegistry.get(id), null);
        const shards = snakeShards(state);
        assert.ok(shards.length >= originalIds.length * 2);
        for (const shard of shards) {
            assert.equal(shard.shape.type, "Polygon");
            assert.equal(shard.strategy.isKinetic, true);
            assert.equal(getPropVisualTint(shard), tint);
        }
    });

    it("impact deaths bias shard velocity away from the contact point", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];
        const impact = { worldX: struck.x - struck.radius, worldY: struck.y, impactForce: 90, struckSegmentId: struck.id };

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id, null, impact);

        const shards = snakeShards(state);
        assert.ok(shards.some((shard) => shard.vx > 10));
        const averageVx = shards.reduce((sum, shard) => sum + shard.vx, 0) / shards.length;
        assert.ok(averageVx > 0);
    });

    it("tiny segments use fallback shards instead of failing fracture", () => {
        applySnakeGameConfig({ startRadius: 1, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id);

        assert.ok(snakeShards(state).length > 0);
        for (const member of snake.chain.members) assert.equal(state.entityRegistry.get(member.id), null);
    });

    it("striker contact deaths produce snake shards", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        const struck = snake.chain.members[1];
        striker.vx = 90;
        striker.vy = 0;
        struck.vx = 0;
        struck.vy = 0;
        striker.x = struck.x - striker.radius - struck.radius + 1;
        striker.y = struck.y;
        const tick = attachKineticTestTickFromState(state, [...snake.chain.members, striker], 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);

        assert.equal(state.sandbox.snakeGame.registry.deadHeadIds.has(snake.chain.head.id), true);
        assert.ok(snakeShards(state).length > 0);
        for (const member of snake.chain.members) assert.equal(state.entityRegistry.get(member.id), null);
    });

    it("same-frame constraint writeback tolerates shattered snake segment removal", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        const struck = snake.chain.members[1];
        striker.vx = 90;
        striker.vy = 0;
        striker.x = struck.x - striker.radius - struck.radius + 1;
        striker.y = struck.y;
        const tick = attachKineticTestTickFromState(state, [...snake.chain.members, striker], 50);
        gatherKineticConstraintSlab(tick);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);

        assert.doesNotThrow(() => resolveGatheredKineticConstraintSlab(tick));
        assert.ok(snakeShards(state).length > 0);
    });
});
