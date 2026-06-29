import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { fractureRetiredSnakeSegmentsFromContacts, SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";
import { getPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { kineticSpatial } from "../Systems/World/KineticSpatialFrame.js";

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
        linkSlack: config.agentProfiles.snake.linkSlack,
        ballType: config.agentProfiles.snake.bodyPropId,
        headBallType: config.agentProfiles.snake.headPropId,
        growDirX: config.agentProfiles.snake.growDirX,
        growDirY: config.agentProfiles.snake.growDirY,
        exportType: SNAKE_CHAIN_EXPORT_TYPE,
    };
}

function wireSnakeGame(state, snake) {
    wireSnakeTestGame(state, [{ headId: snake.chain.head.id, spawnGroupId: snake.chain.spawnGroupId }]);
    return state.sandbox.snakeGame.instancesByHeadId.get(snake.chain.head.id);
}

function snakeShards(state) {
    return state.worldProps.filter((prop) => prop.type === SNAKE_SHARD_PROP_ID);
}
function spawnFastImpactBall(state, x, y, radius = 2) {
    const ball = spawnPlacedSandboxProp(state, x, y, "ball");
    setCirclePropRadius(ball, radius);
    return ball;
}

function assertSnakeShardCountForOneSegment(shards) {
    assert.ok(shards.length >= 2);
    assert.ok(shards.length <= 3);
}

describe("snake segment fracture", () => {
    it("non-impact death leaves retired segment props intact", () => {
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const instance = wireSnakeGame(state, snake);
        const originalIds = snake.chain.members.map((prop) => prop.id);

        instance.kill(state);

        for (const id of originalIds) assert.ok(state.entityRegistry.get(id));
        assert.equal(snakeShards(state).length, 0);
    });

    it("impact deaths fracture only the struck segment and inherit parent motion", () => {
        applySnakeGameConfig({ startRadius: 2, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const instance = wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];
        const tint = getPropVisualTint(struck);
        struck.vx = 7;
        struck.vy = 3;
        struck.angularVelocity = 0.25;
        const impact = { worldX: struck.x - struck.radius, worldY: struck.y, impactForce: 90, struckSegmentId: struck.id };

        instance.kill(state, null, impact);

        const shards = snakeShards(state);
        assertSnakeShardCountForOneSegment(shards);
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
        for (const shard of shards) {
            assert.equal(shard.shape.type, "Polygon");
            assert.equal(shard.strategy.isKinetic, true);
            assert.equal(getPropVisualTint(shard), tint);
            assert.equal(shard.vx, struck.vx);
            assert.equal(shard.vy, struck.vy);
            assert.equal(shard.angularVelocity, struck.angularVelocity);
        }
    });

    it("tiny struck segments use fallback shards instead of failing fracture", () => {
        applySnakeGameConfig({ startRadius: 1, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const instance = wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];

        instance.kill(state, null, { worldX: struck.x, worldY: struck.y, impactForce: 30, struckSegmentId: struck.id });

        assertSnakeShardCountForOneSegment(snakeShards(state));
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
    });

    it("unstruck retired segments can fracture on later impacts", () => {
        applySnakeGameConfig({ startRadius: 2, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const instance = wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];
        instance.kill(state, null, { worldX: struck.x, worldY: struck.y, impactForce: 90, struckSegmentId: struck.id });
        const initialShardCount = snakeShards(state).length;
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));

        const head = snake.chain.head;
        const impactor = spawnFastImpactBall(state, head.x - head.radius * 2, head.y, head.radius);
        impactor.vx = 90;
        impactor.vy = 0;
        head.vx = 0;
        head.vy = 0;
        impactor.x = head.x - impactor.radius - head.radius + 1;
        impactor.y = head.y;
        const tick = attachKineticTestTickFromState(state, [head, snake.chain.tail, impactor], 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, kineticContactBuffer);

        assert.equal(state.entityRegistry.get(head.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
        assertSnakeShardCountForOneSegment(snakeShards(state).slice(initialShardCount));
    });

    it("newly spawned shards are admitted to kineticSpatial even before begin() runs (paused state)", () => {
        // Reset the singleton frame back to initial state (populatedMembershipGen = 0, _nextPhysId = 0)
        kineticSpatial.populatedMembershipGen = 0;
        kineticSpatial._nextPhysId = 0;
        kineticSpatial._kineticBodies = [];
        kineticSpatial._activeKineticBodies = [];

        applySnakeGameConfig({ startRadius: 2, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const instance = wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];

        // Trigger kill without running simulation ticks (as in paused/initial state)
        instance.kill(state, null, { worldX: struck.x, worldY: struck.y, impactForce: 30, struckSegmentId: struck.id });

        const shards = snakeShards(state);
        assert.ok(shards.length >= 2);
        for (const shard of shards) {
            // Verify shard has been admitted to the spatial frame
            assert.notEqual(shard._physId, undefined);
            assert.ok(!isNaN(shard._physId));
            // Verify it is active
            assert.ok(shard._activeSlot >= 0);
            assert.ok(kineticSpatial._activeKineticBodies.includes(shard));
        }
    });
});
