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
import { createAgentAutosim } from "../Libraries/Game/snake/agentAutosim.js";
import { AGENT_PROFILE } from "../Libraries/AI/agents/agentProfile.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { attachKineticTestTickFromState } from "./harness/kineticTickHarness.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
import { applySnakeHuntContactDrive, resolveSnakeCombatFromContacts } from "../Libraries/Game/snake/snakeCombat.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";

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

function wireCombatSnakeGame(state, snakes) {
    return wireSnakeTestGame(state, snakes.map(({ headId, spawnGroupId, autosim }) => ({ headId, spawnGroupId, autosim })));
}

describe("snake combat min length", () => {
    it("resolveSnakeCombatFromContacts is a draw on hard snake head-to-head ram", () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3, growDirX: -1 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        applySnakeGameConfig({ agentProfiles: { snake: { growDirX: 1 } } });
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(5));
        applySnakeGameConfig({ agentProfiles: { snake: { growDirX: -1 } } });
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
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(registry.deadHeadIds.size, 0);
        assert.equal(getOrderedChainMemberIds(state, predator.chain.head.id).length, 6);
        assert.equal(getOrderedChainMemberIds(state, prey.chain.head.id).length, 5);
    });

    it("equal-size rivals draw on hard head-to-head ram", () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3, growDirX: -1 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const red = spawnSnakeChain(state, { col: 8, row: 8 }, { ...snakeChainOptions(5), faction: "red" });
        applySnakeGameConfig({ agentProfiles: { snake: { growDirX: 1 } } });
        const blue = spawnSnakeChain(state, { col: 20, row: 8 }, { ...snakeChainOptions(5), faction: "blue" });
        applySnakeGameConfig({ agentProfiles: { snake: { growDirX: -1 } } });
        wireCombatSnakeGame(state, [
            { headId: red.chain.head.id, spawnGroupId: red.chain.spawnGroupId },
            { headId: blue.chain.head.id, spawnGroupId: blue.chain.spawnGroupId },
        ]);
        const redHead = red.chain.head;
        const blueHead = blue.chain.head;
        redHead.vx = 80;
        redHead.vy = 0;
        blueHead.vx = -80;
        blueHead.vy = 0;
        redHead.x = blueHead.x - redHead.radius - blueHead.radius + 2;
        redHead.y = blueHead.y;
        const props = [...red.chain.members, ...blue.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(registry.deadHeadIds.size, 0);
        assert.equal(getOrderedChainMemberIds(state, red.chain.head.id).length, 5);
        assert.equal(getOrderedChainMemberIds(state, blue.chain.head.id).length, 5);
    });

    it("same-faction head strike does not split ally body segment", () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const striker = spawnSnakeChain(state, { col: 8, row: 8 }, { ...snakeChainOptions(5), faction: "red" });
        const ally = spawnSnakeChain(state, { col: 20, row: 8 }, { ...snakeChainOptions(5), faction: "red" });
        wireCombatSnakeGame(state, [
            { headId: striker.chain.head.id, spawnGroupId: striker.chain.spawnGroupId },
            { headId: ally.chain.head.id, spawnGroupId: ally.chain.spawnGroupId },
        ]);
        const allyMembers = getOrderedChainMemberIds(state, ally.chain.head.id);
        const struckBody = state.entityRegistry.getLive(allyMembers[2]);
        striker.chain.head.vx = 80;
        striker.chain.head.vy = 0;
        struckBody.vx = -5;
        struckBody.vy = 0;
        striker.chain.head.x = struckBody.x - striker.chain.head.radius - struckBody.radius + 2;
        striker.chain.head.y = struckBody.y;
        const props = [...striker.chain.members, ...ally.chain.members];
        const tick = attachKineticTestTickFromState(state, props, 50);
        const pairs = gatherKineticContactPairs(tick);
        resolveKineticContactPassWithPairs(tick, pairs);
        applyKineticContactSideEffects(tick, kineticContactBuffer);
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(getOrderedChainMemberIds(state, ally.chain.head.id).length, 5);
    });

    it("head into enemy tail does not split or kill the pursuer", () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
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
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        const registry = state.sandbox.snakeGame.registry;
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(registry.deadHeadIds.size, 0);
        assert.equal(getOrderedChainMemberIds(state, small.chain.head.id).length, 3);
    });

    it("larger snake head strike on smaller body splits the victim and stops its autosim when it dies", () => {
        applySnakeGameConfig({ splitImpulseThreshold: 30, agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, { ...snakeChainOptions(6), faction: "red" });
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, { ...snakeChainOptions(3), faction: "blue" });
        wireCombatSnakeGame(state, [
            { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        const predatorInstance = state.sandbox.snakeGame.instancesByHeadId.get(predator.chain.head.id);
        const predatorAutosim = createAgentAutosim(state, predatorInstance);
        predatorInstance.autosim = predatorAutosim;
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
        resolveSnakeCombatFromContacts(state, tick.frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(registry.deadHeadIds.has(prey.chain.head.id), true);
        assert.equal(state.sandbox.snakeGame.instancesByHeadId.has(prey.chain.head.id), false);
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(getOrderedChainMemberIds(state, predator.chain.head.id).length, 6);
        assert.equal(state.worldProps.some((prop) => prop.type === SNAKE_SHARD_PROP_ID), true);
    });

    it("kill only tears down the defeated snake spawn group", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { minAliveSegmentCount: 3 } } });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(3));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(3));
        assert.notEqual(predator.chain.spawnGroupId, prey.chain.spawnGroupId);
        wireCombatSnakeGame(state, [
            { headId: predator.chain.head.id, spawnGroupId: predator.chain.spawnGroupId },
            { headId: prey.chain.head.id, spawnGroupId: prey.chain.spawnGroupId },
        ]);
        const preyInstance = state.sandbox.snakeGame.instancesByHeadId.get(prey.chain.head.id);
        preyInstance.kill(state);
        assert.equal(getOrderedChainMemberIds(state, predator.chain.head.id).length, 3);
        assert.equal(getOrderedChainMemberIds(state, prey.chain.head.id).length, 1);
    });
});
