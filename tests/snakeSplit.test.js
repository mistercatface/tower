import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getOrderedChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnSnakeChain, SNAKE_CHAIN_EXPORT_TYPE } from "../Libraries/Game/snake/snakeScene.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { isAliveAgentHead } from "../Libraries/AI/agents/agentPopulationRegistry.js";
import { splitSnakeAtStruckSegment, killSnake, enforceSnakeMinLength } from "../Libraries/Game/snake/snakeCombat.js";
import { getAgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { steerRollToward } from "../Libraries/Sandbox/kineticRollActuator.js";
import { removeChainLinkBetween } from "../Libraries/Sandbox/chainLinks.js";

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

function mockSnakeGame(state, headIds, spawnGroupIdByHeadId = null) {
    const snakes = headIds.map((headId) => ({
        headId,
        spawnGroupId: spawnGroupIdByHeadId?.get(headId) ?? `test:${headId}`,
    }));
    return wireSnakeTestGame(state, snakes).snakeGame;
}

describe("snake split on impact", () => {
    it("getOrderedChainMemberIds walks head to tail", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 4 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(4));
        const ordered = getOrderedChainMemberIds(state, pack.chain.head.id);
        assert.equal(ordered.length, 4);
        assert.equal(ordered[0], pack.chain.head.id);
        assert.equal(ordered[3], pack.chain.tail.id);
    });

    it("split at middle segment severs tail into inert instance", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
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
        assert.equal(state.kinetic.kineticConstraints.length, 3);
        assert.ok(isAliveAgentHead(snakeGame.registry, headId));
        assert.equal(snakeGame.registry.inertByLeadId.size, 1);
    });

    it("split that leaves too few segments kills the survivor", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3, segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const members = getOrderedChainMemberIds(state, headId);
        splitSnakeAtStruckSegment(state, snakeGame, headId, members[0]);
        assert.equal(isAliveAgentHead(snakeGame.registry, headId), false);
        assert.equal(snakeGame.instancesByHeadId.has(headId), false);
        assert.equal(state.kinetic.kineticConstraints.length, 0);
    });
});

describe("snake min length death", () => {
    it("enforceSnakeMinLength kills head-only chain", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(1));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.ok(enforceSnakeMinLength(state, snakeGame, headId));
        assert.equal(isAliveAgentHead(snakeGame.registry, headId), false);
    });

    it("enforceSnakeMinLength kills head plus one segment", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(2));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.ok(enforceSnakeMinLength(state, snakeGame, headId));
        assert.equal(snakeGame.instancesByHeadId.has(headId), false);
    });

    it("killSnake stops autosim and clears chain links", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        assert.equal(state.kinetic.kineticConstraints.length, 2);
        killSnake(state, snakeGame, headId);
        assert.equal(state.kinetic.kineticConstraints.length, 0);
        assert.equal(snakeGame.instancesByHeadId.has(headId), false);
    });

    it("killSnake strips nav drive but keeps segment velocity", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const head = pack.chain.head;
        head.vx = 42;
        head.vy = -17;
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        killSnake(state, snakeGame, headId);
        assert.equal(head.vx, 42);
        assert.equal(head.vy, -17);
        assert.equal(head._groundRollDrive, undefined);
    });

    it("split inert tail retires nav drive on severed segments", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const members = getOrderedChainMemberIds(state, headId);
        const tailLead = state.entityRegistry.getLive(members[3]);
        tailLead.vx = 30;
        tailLead.vy = 5;
        tailLead._groundRollDrive = { kind: "thrust", dirX: 0, dirY: 1, accel: 5, maxSpeed: 10 };
        splitSnakeAtStruckSegment(state, snakeGame, headId, members[2]);
        assert.equal(tailLead.vx, 30);
        assert.equal(tailLead.vy, 5);
        assert.equal(tailLead._groundRollDrive, undefined);
    });

    it("alive registry guard skips autosim tick for dead heads", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const head = pack.chain.head;
        const instance = getAgentInstance(snakeGame, headId);
        instance.autosim = {
            start() {},
            stop() {},
            tick() {
                steerRollToward(head, 1, 0, { accel: 10, maxSpeed: 50 });
            },
        };
        killSnake(state, snakeGame, headId);
        head.vx = 0;
        head.vy = 0;
        for (const liveInstance of snakeGame.instancesByHeadId.values()) {
            if (!snakeGame.registry.aliveByHeadId.has(liveInstance.headId)) continue;
            liveInstance.autosim.tick(50);
        }
        assert.equal(head.vx, 0);
        assert.equal(head.vy, 0);
        assert.equal(head._groundRollDrive, undefined);
    });

    it("instance validate kills a head orphaned below min segment count", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const instance = getAgentInstance(snakeGame, headId);
        const members = getOrderedChainMemberIds(state, headId);
        removeChainLinkBetween(state, members[0], members[1]);
        removeChainLinkBetween(state, members[1], members[2]);
        instance.validate(state, snakeGame);
        assert.equal(instance.lifecycle, "dead");
        assert.equal(snakeGame.instancesByHeadId.has(headId), false);
        assert.equal(pack.chain.head._groundRollDrive, undefined);
    });

    it("killSnake retires split-off inert tail from the same snake instance", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(5));
        const headId = pack.chain.head.id;
        const snakeGame = mockSnakeGame(state, [headId]);
        const members = getOrderedChainMemberIds(state, headId);
        splitSnakeAtStruckSegment(state, snakeGame, headId, members[2]);
        const inertLead = state.entityRegistry.getLive(members[3]);
        inertLead._groundRollDrive = { kind: "thrust", dirX: 0, dirY: 1, accel: 5, maxSpeed: 10 };
        killSnake(state, snakeGame, headId);
        assert.equal(inertLead._groundRollDrive, undefined);
        assert.equal(snakeGame.registry.inertByLeadId.size, 0);
    });
});
