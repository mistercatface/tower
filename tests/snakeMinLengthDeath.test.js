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
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import { gatherKineticContactPairs, kineticContactBuffer, resolveKineticContactPassWithPairs } from "../Libraries/Spatial/collision/kineticContactSolver.js";
import { applyKineticContactSideEffects } from "../Libraries/Spatial/collision/kineticContactSideEffects.js";
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
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
        hpaPathWorker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} },
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

function stubAutosim() {
    return { stop() {} };
}
function wireCombatSnakeGame(state, registry, headIds) {
    const autosimsByHeadId = new Map();
    for (let i = 0; i < headIds.length; i++) autosimsByHeadId.set(headIds[i], stubAutosim());
    wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
    return autosimsByHeadId;
}
function setupSnakeFrame(props) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    for (let i = 0; i < props.length; i++) {
        frame.insertEntity(props[i], i);
        props[i]._physId = i;
    }
    frame._kineticBodies = props.slice();
    frame._activeKineticBodies = props.slice();
    return frame;
}

describe("snake combat min length", () => {
    it("resolveSnakeCombatFromContacts splits smaller snake on hard head-to-head ram", () => {
        applySnakeGameConfig({ minAliveSegmentCount: 3, splitImpulseThreshold: 30 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnSnakeChain(state, { col: 8, row: 8 }, snakeChainOptions(6));
        const prey = spawnSnakeChain(state, { col: 20, row: 8 }, snakeChainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, predator.chain.head.id);
        registerAliveSnake(registry, prey.chain.head.id);
        wireCombatSnakeGame(state, registry, [predator.chain.head.id, prey.chain.head.id]);
        const preyHead = prey.chain.head;
        predator.chain.head.vx = 80;
        predator.chain.head.vy = 0;
        preyHead.vx = -10;
        preyHead.vy = 0;
        predator.chain.head.x = preyHead.x - predator.chain.head.radius - preyHead.radius + 2;
        predator.chain.head.y = preyHead.y;
        const props = [...predator.chain.members, ...prey.chain.members];
        const frame = setupSnakeFrame(props);
        const pairs = gatherKineticContactPairs(frame, state.kinetic);
        resolveKineticContactPassWithPairs(frame, pairs);
        applyKineticContactSideEffects(state, frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
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
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, big.chain.head.id);
        registerAliveSnake(registry, small.chain.head.id);
        wireCombatSnakeGame(state, registry, [big.chain.head.id, small.chain.head.id]);
        const bigTail = big.chain.tail;
        const smallHead = small.chain.head;
        smallHead.vx = 80;
        smallHead.vy = 0;
        bigTail.vx = 40;
        bigTail.vy = 0;
        smallHead.x = bigTail.x - smallHead.radius - bigTail.radius + 2;
        smallHead.y = bigTail.y;
        const props = [...big.chain.members, ...small.chain.members];
        const frame = setupSnakeFrame(props);
        const pairs = gatherKineticContactPairs(frame, state.kinetic);
        resolveKineticContactPassWithPairs(frame, pairs);
        applyKineticContactSideEffects(state, frame, kineticContactBuffer);
        assert.ok(kineticContactBuffer.count >= 1);
        assert.equal(registry.inertByLeadId.size, 0);
        assert.equal(registry.deadHeadIds.size, 0);
        assert.equal(getOrderedChainMemberIds(state, small.chain.head.id).length, 3);
    });
});
