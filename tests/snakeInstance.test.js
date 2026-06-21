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
import { createSnakeLifecycleRegistry, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { SnakeInstance, createAliveSnakeInstance, registerAliveSnakeInstance } from "../Libraries/Game/snake/SnakeInstance.js";
import { steerRollToward, applyGroundRollDrive } from "../Libraries/Sandbox/kineticRollActuator.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "../Libraries/Game/snake/snakeSteeringLease.js";
import { killSnake } from "../Libraries/Game/snake/snakeCombat.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";

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
        nav: { settings: {}, commitEdit: async () => {}, topologyKey: () => "", syncedTopologyKey: () => "", graphSyncGeneration: 0, worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => null }, session: { isReplanInFlight: () => false }, topology: null },
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

describe("SnakeInstance", () => {
    it("stopSteering clears head roll drive via autosim stop", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const head = pack.chain.head;
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        const instance = new SnakeInstance({
            headId: head.id,
            spawnGroupId: pack.chain.spawnGroupId,
            autosim: { stop() { delete head._groundRollDrive; } },
            lifecycle: "alive",
        });
        instance.stopSteering(state);
        assert.equal(head._groundRollDrive, undefined);
        assert.ok(head._snakeSteering);
        assert.notEqual(head._snakeSteering.epoch, instance.steeringEpoch);
    });

    it("steering lease blocks roll drive after revoke", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const head = pack.chain.head;
        const registry = createSnakeLifecycleRegistry();
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const instance = new SnakeInstance({
            headId: head.id,
            spawnGroupId: pack.chain.spawnGroupId,
            autosim: { start() {}, stop() {} },
            lifecycle: "alive",
        });
        registerAliveSnakeInstance(state.sandbox.snakeGame, instance);
        grantSnakeSteeringLease(instance, state);
        steerRollToward(head, 1, 0, { accel: 600, maxSpeed: 180 }, state);
        assert.ok(head._groundRollDrive);
        revokeSnakeSteeringLease(instance, state);
        steerRollToward(head, 1, 0, { accel: 600, maxSpeed: 180 }, state);
        assert.equal(head._groundRollDrive, undefined);
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 600, maxSpeed: 180 };
        applyGroundRollDrive(head, 1 / 60, state);
        assert.equal(head._groundRollDrive, undefined);
        assert.equal(head.vx, 0);
    });

    it("retireAllSegments clears roll drive on every member", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const headId = pack.chain.head.id;
        const registry = createSnakeLifecycleRegistry();
        const autosimsByHeadId = new Map();
        wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
        const instance = new SnakeInstance({
            headId,
            spawnGroupId: pack.chain.spawnGroupId,
            autosim: { stop() {} },
            lifecycle: "alive",
            memberIds: getOrderedChainMemberIds(state, headId),
        });
        registerAliveSnakeInstance(state.sandbox.snakeGame, instance);
        const members = getOrderedChainMemberIds(state, headId);
        for (let i = 0; i < members.length; i++) {
            const prop = state.entityRegistry.getLive(members[i]);
            prop._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        }
        instance.retireAllSegments(state, state.sandbox.snakeGame);
        for (let i = 0; i < members.length; i++) {
            const prop = state.entityRegistry.getLive(members[i]);
            assert.equal(prop._groundRollDrive, undefined);
        }
    });

    it("createAliveSnakeInstance registers in snakeGame maps", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const instance = createAliveSnakeInstance(state, {
            headId: pack.chain.head.id,
            spawnGroupId: pack.chain.spawnGroupId,
            navWalkable: createSnakeNavWalkable(state),
        });
        registerAliveSnakeInstance(state.sandbox.snakeGame, instance);
        const snakeGame = state.sandbox.snakeGame;
        assert.equal(snakeGame.instancesByHeadId.get(pack.chain.head.id), instance);
        assert.equal(snakeGame.autosimsByHeadId.get(pack.chain.head.id), instance.autosim);
        assert.equal(snakeGame.registry.aliveByHeadId.has(pack.chain.head.id), true);
        assert.equal(instance.memberIds.length, 3);
    });

    it("physics clears roll drive on dead chain heads", () => {
        applySnakeGameConfig({ segmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const pack = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const instance = new SnakeInstance({
            headId: pack.chain.head.id,
            spawnGroupId: pack.chain.spawnGroupId,
            autosim: { start() {}, stop() {} },
            lifecycle: "alive",
        });
        registerAliveSnakeInstance(state.sandbox.snakeGame, instance);
        grantSnakeSteeringLease(instance, state);
        const head = pack.chain.head;
        head._groundRollDrive = { kind: "thrust", dirX: 1, dirY: 0, accel: 5, maxSpeed: 10 };
        killSnake(state, state.sandbox.snakeGame, head.id);
        applyGroundRollDrive(head, 1 / 60, state);
        assert.equal(head._groundRollDrive, undefined);
        assert.equal(head.vx, 0);
    });
});
