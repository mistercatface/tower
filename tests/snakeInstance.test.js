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
import { createSnakeAgentSession, registerAgentInstance } from "../Libraries/Game/snake/snakeAgentSession.js";
import { SNAKE_GAME_SPECIES } from "../Libraries/Game/snake/species/index.js";
import { createAgentPopulationRegistry, isAliveAgentHead } from "../Libraries/AI/agents/AgentProfiles.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/AgentProfiles.js";
import { AgentInstance } from "../Libraries/Game/snake/AgentInstance.js";
import { steerRollToward, applyGroundRollDrive } from "../Libraries/Sandbox/kineticRollActuator.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";

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
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => null }, session: { isReplanInFlight: () => false }, topology: null },
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

function attachSnakeGame(state) {
    const registry = createAgentPopulationRegistry();
    const session = createSnakeAgentSession({ registry, navWalkable: createSnakeNavWalkable(state), speciesById: SNAKE_GAME_SPECIES });
    state.sandbox.snakeGame = session;
    return session;
}

describe("AgentInstance (snake)", () => {
    it("stopSteering clears head roll drive via autosim stop", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        attachSnakeGame(state);
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const head = pack.chain.head;
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        const instance = new AgentInstance(state, {
            profileId: AGENT_PROFILE.snake,
            head,
            spawnGroupId: pack.chain.spawnGroupId,
            lifecycle: "alive",
        });
        instance.autosim = { stop() { delete head._groundRollDrive; } };
        instance.stopSteering();
        assert.equal(head._groundRollDrive, undefined);
        assert.ok(head._snakeSteering);
        assert.notEqual(head._snakeSteering.epoch, instance.steeringEpoch);
    });

    it("steering lease blocks roll drive after revoke", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const head = pack.chain.head;
        attachSnakeGame(state);
        const instance = new AgentInstance(state, {
            profileId: AGENT_PROFILE.snake,
            head,
            spawnGroupId: pack.chain.spawnGroupId,
            lifecycle: "alive",
        });
        instance.autosim = { start() {}, stop() {} };
        registerAgentInstance(state.sandbox.snakeGame, "snake", instance);
        instance.grantSteeringLease();
        steerRollToward(head, 1, 0, { accel: 600, maxSpeed: 180 }, state);
        assert.ok(head._groundRollDrive);
        instance.revokeSteeringLease();
        steerRollToward(head, 1, 0, { accel: 600, maxSpeed: 180 }, state);
        assert.equal(head._groundRollDrive, undefined);
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 600, maxSpeed: 180 };
        applyGroundRollDrive(head, 1 / 60, state);
        assert.equal(head._groundRollDrive, undefined);
        assert.equal(head.vx, 0);
    });

    it("retireAllSegments clears roll drive on every member", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const head = pack.chain.head;
        const headId = pack.chain.head.id;
        attachSnakeGame(state);
        const instance = new AgentInstance(state, {
            profileId: AGENT_PROFILE.snake,
            head,
            spawnGroupId: pack.chain.spawnGroupId,
            lifecycle: "alive",
            memberIds: getOrderedChainMemberIds(state, headId),
        });
        instance.autosim = { stop() {} };
        registerAgentInstance(state.sandbox.snakeGame, "snake", instance);
        const members = getOrderedChainMemberIds(state, headId);
        for (let i = 0; i < members.length; i++) {
            const prop = state.entityRegistry.getLive(members[i]);
            prop._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        }
        instance.retireAllSegments(state);
        for (let i = 0; i < members.length; i++) {
            const prop = state.entityRegistry.getLive(members[i]);
            assert.equal(prop._groundRollDrive, undefined);
        }
    });

    it("constructor wires instance into snakeGame state", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const registry = createAgentPopulationRegistry();
        const session = createSnakeAgentSession({ registry, navWalkable: createSnakeNavWalkable(state), speciesById: SNAKE_GAME_SPECIES });
        state.sandbox.snakeGame = session;
        const instance = new AgentInstance(state, {
            profileId: AGENT_PROFILE.snake,
            head: pack.chain.head,
            spawnGroupId: pack.chain.spawnGroupId,
        });
        registerAgentInstance(state.sandbox.snakeGame, "snake", instance);
        const snakeGame = state.sandbox.snakeGame;
        assert.equal(instance.head, pack.chain.head);
        assert.equal(instance.headId, pack.chain.head.id);
        assert.equal(snakeGame.instancesByHeadId.get(pack.chain.head.id), instance);
        assert.equal(isAliveAgentHead(snakeGame.registry, pack.chain.head.id), true);
        assert.equal(instance.memberIds.length, 3);
    });

    it("physics clears roll drive on dead chain heads", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { segmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        attachSnakeGame(state);
        const instance = new AgentInstance(state, {
            profileId: AGENT_PROFILE.snake,
            head: pack.chain.head,
            spawnGroupId: pack.chain.spawnGroupId,
            lifecycle: "alive",
        });
        instance.autosim = { start() {}, stop() {} };
        registerAgentInstance(state.sandbox.snakeGame, "snake", instance);
        instance.grantSteeringLease();
        const head = pack.chain.head;
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        instance.kill(state);
        applyGroundRollDrive(head, 1 / 60, state);
        assert.equal(head._groundRollDrive, undefined);
        assert.equal(head.vx, 0);
    });
});
