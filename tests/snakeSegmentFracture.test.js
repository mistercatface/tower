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
import { fractureRetiredSnakeSegmentsFromContacts, SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";
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
function assertSnakeShardCountForOneSegment(shards) {
    assert.ok(shards.length >= 4);
    assert.ok(shards.length <= 5);
}

describe("snake segment fracture", () => {
    it("non-impact death leaves retired segment props intact", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const originalIds = snake.chain.members.map((prop) => prop.id);

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id);

        for (const id of originalIds) assert.ok(state.entityRegistry.get(id));
        assert.equal(snakeShards(state).length, 0);
    });

    it("impact deaths fracture only the struck segment and inherit parent motion", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];
        const tint = getPropVisualTint(struck);
        struck.vx = 7;
        struck.vy = 3;
        struck.angularVelocity = 0.25;
        const impact = { worldX: struck.x - struck.radius, worldY: struck.y, impactForce: 90, struckSegmentId: struck.id };

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id, null, impact);

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
        applySnakeGameConfig({ startRadius: 1, minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];

        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id, null, { worldX: struck.x, worldY: struck.y, impactForce: 30, struckSegmentId: struck.id });

        assertSnakeShardCountForOneSegment(snakeShards(state));
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
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
        assertSnakeShardCountForOneSegment(snakeShards(state));
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
    });

    it("unstruck retired segments can fracture on later impacts", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        wireSnakeGame(state, snake);
        const struck = snake.chain.members[1];
        killSnake(state, state.sandbox.snakeGame, snake.chain.head.id, null, { worldX: struck.x, worldY: struck.y, impactForce: 90, struckSegmentId: struck.id });
        const initialShardCount = snakeShards(state).length;
        assert.equal(state.entityRegistry.get(struck.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.head.id));
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));

        const striker = spawnSnakeStriker(state, snake.chain.head);
        const head = snake.chain.head;
        striker.vx = 90;
        striker.vy = 0;
        head.vx = 0;
        head.vy = 0;
        striker.x = head.x - striker.radius - head.radius + 1;
        striker.y = head.y;
        const tick = attachKineticTestTickFromState(state, [head, snake.chain.tail, striker], 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, kineticContactBuffer);

        assert.equal(state.entityRegistry.get(head.id), null);
        assert.ok(state.entityRegistry.get(snake.chain.tail.id));
        assertSnakeShardCountForOneSegment(snakeShards(state).slice(initialShardCount));
    });

    it("inert split tail segments can fracture on later impacts", () => {
        applySnakeGameConfig({ startRadius: 2, minAliveSegmentCount: 3, splitImpulseThreshold: 30, kineticMinStrikeSpeed: 28, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        wireSnakeGame(state, snake);
        const striker = spawnSnakeStriker(state, snake.chain.head);
        const struck = snake.chain.members[2];
        striker.vx = 90;
        striker.vy = 0;
        striker.x = struck.x - striker.radius - struck.radius + 1;
        striker.y = struck.y;
        let tick = attachKineticTestTickFromState(state, [...snake.chain.members, striker], 50);
        let pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        resolveStrikerBallSnakeSplitsFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame, striker);

        const inertEntry = [...state.sandbox.snakeGame.registry.inertByLeadId.values()][0];
        assert.ok(inertEntry);
        const inertLead = state.entityRegistry.getLive(inertEntry.leadSegmentId);
        const inertTail = state.entityRegistry.getLive(inertEntry.memberIds[inertEntry.memberIds.length - 1]);
        assert.ok(inertLead);
        assert.ok(inertTail);
        assert.equal(snakeShards(state).length, 0);

        striker.vx = 90;
        striker.vy = 0;
        inertLead.vx = 0;
        inertLead.vy = 0;
        striker.x = inertLead.x - striker.radius - inertLead.radius + 1;
        striker.y = inertLead.y;
        tick = attachKineticTestTickFromState(state, [inertLead, inertTail, striker], 50);
        pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);

        fractureRetiredSnakeSegmentsFromContacts(state, tick.frame, kineticContactBuffer);

        assert.equal(state.entityRegistry.get(inertLead.id), null);
        assert.ok(state.entityRegistry.get(inertTail.id));
        assertSnakeShardCountForOneSegment(snakeShards(state));
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
