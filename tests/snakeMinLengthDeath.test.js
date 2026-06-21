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
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts, killSnake } from "../Libraries/Game/snake/snakeCombat.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";

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

function wireCombatSnakeGame(state, snakes) {
    return wireSnakeTestGame(state, snakes.map(({ headId, spawnGroupId, autosim }) => ({ headId, spawnGroupId, autosim })));
}

describe("snake combat min length", () => {
    it("resolveSnakeCombatFromContacts splits smaller snake on hard head-to-head ram", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(5));
        wireCombatSnakeGame(state, [
            { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        const preyHead = prey.chain.head;
        predator.chain.head.vx = 80;
        predator.chain.head.vy = 0;
        preyHead.vx = -10;
        preyHead.vy = 0;
        predator.chain.head.x = preyHead.x - predator.chain.head.radius - preyHead.radius + 2;
        predator.chain.head.y = preyHead.y;
        const props = [...predator.chain.members, ...prey.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        const preyHeadId = prey.chain.head.id;
        const splitHappened = registry.inertByLeadId.size > 0;
        const preyDead = registry.deadHeadIds.has(preyHeadId);
        assert.ok(splitHappened || preyDead);
        if (registry.aliveByHeadId.has(preyHeadId)) {
            assert.ok(getOrderedChainMemberIds(state, preyHeadId).length >= 3);
        }
    });

    it("head into enemy tail does not split or kill the pursuer", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const big = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        const small = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(3));
        wireCombatSnakeGame(state, [
            { headId: big.chain.head.id, spawnGroupId: big.chain.spawnGroupId },
            { headId: small.chain.head.id, spawnGroupId: small.chain.spawnGroupId },
        ]);
        const bigTail = big.chain.tail;
        const smallHead = small.chain.head;
        smallHead.vx = 80;
        smallHead.vy = 0;
        bigTail.vx = 40;
        bigTail.vy = 0;
        smallHead.x = bigTail.x - smallHead.radius - bigTail.radius + 2;
        smallHead.y = bigTail.y;
        const props = [...big.chain.members, ...small.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(registry.deadHeadIds.size, 0);
        assert.equal(getOrderedChainMemberIds(state, small.chain.head.id).length, 3);
    });

    it("larger snake head strike on smaller body splits the victim and stops its autosim when it dies", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(3));
        const { autosimsByHeadId } = wireCombatSnakeGame(state, [
            { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        const predatorAutosim = createSnakeAutosim(state, { headId: predator.chain.head.id, navWalkable: state.sandbox.snakeGame.navWalkable });
        autosimsByHeadId.set(predator.chain.head.id, predatorAutosim);
        const registry = state.sandbox.snakeGame.registry;
        const preyMembers = getOrderedChainMemberIds(state, prey.chain.head.id);
        const struckBody = state.entityRegistry.getLive(preyMembers[1]);
        predator.chain.head.vx = 80;
        predator.chain.head.vy = 0;
        struckBody.vx = -5;
        struckBody.vy = 0;
        predator.chain.head.x = struckBody.x - predator.chain.head.radius - struckBody.radius + 2;
        predator.chain.head.y = struckBody.y;
        const props = [...predator.chain.members, ...prey.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(registry.deadHeadIds.has(prey.chain.head.id), true);
        assert.equal(autosimsByHeadId.has(prey.chain.head.id), false);
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(getOrderedChainMemberIds(state, predator.chain.head.id).length, 6);
        assert.equal(state.worldProps.some((prop) => prop.type === SNAKE_SHARD_PROP_ID), true);
    });

    it("seek_prey contact restores hunter drive after contact impulse", () => {
        applySnakeGameConfig({ headMaxSpeed: 120, minAliveSegmentCount: 3, splitImpulseThreshold: 999 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(3));
        wireCombatSnakeGame(state, [
            {
                headId: predator.chain.head.id,
                spawnGroupId: predator.chain.spawnGroupId,
                autosim: {
                    start() {},
                    stop() {},
                    getMode: () => "seek_prey",
                    getTargetId: () => prey.chain.head.id,
                },
            },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        const hunterHead = predator.chain.head;
        const preyHead = prey.chain.head;
        hunterHead.vx = 20;
        hunterHead.vy = 0;
        preyHead.vx = 0;
        preyHead.vy = 0;
        hunterHead.x = preyHead.x - hunterHead.radius - preyHead.radius + 2;
        hunterHead.y = preyHead.y;
        const props = [...predator.chain.members, ...prey.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        assert.ok(kineticContactBuffer.count >= 1);
        applySnakeHuntContactDrive(state, tick.frame, kineticContactBuffer, state.sandbox.snakeGame);
        assert.equal(Math.round(kineticDynamicSlab.vx[hunterHead._physId]), 120);
        assert.equal(Math.round(kineticDynamicSlab.vy[hunterHead._physId]), 0);
    });

    it("killSnake only tears down the defeated snake spawn group", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(3));
        assert.notEqual(predator.chain.spawnGroupId, prey.chain.spawnGroupId);
        wireCombatSnakeGame(state, [
            { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        killSnake(state, state.sandbox.snakeGame, prey.chain.head.id);
        assert.equal(getOrderedChainMemberIds(state, predator.chain.head.id).length, 3);
        assert.equal(getOrderedChainMemberIds(state, prey.chain.head.id).length, 1);
    });
});
