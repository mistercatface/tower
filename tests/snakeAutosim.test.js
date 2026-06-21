import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { findSnakeFoodProp } from "../Libraries/Game/snake/snakeFood.js";
import { FRAME_MS } from "./frameMs.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { createSnakeLifecycleRegistry, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { getCirclePropRadius } from "../Libraries/Props/propScale.js";
import { SNAKE_SHARD_PROP_ID } from "../Libraries/Game/snake/snakeSegmentFracture.js";
import { removeSandboxWorldProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";

loadPropAssets();

function createSnakeAutosimTestState(cols = 32, rows = 32) {
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
        nav: {
            settings: {},
            commitEdit: async () => {},
            topologyKey: () => "",
            syncedTopologyKey: () => "",
            graphSyncGeneration: 0,
            worker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} },
            session: { isReplanInFlight: () => false, beginFrame: () => {}, flushFrame: () => {}, requestReplan: () => {} },
            topology: { grid, wallRevision: 0 },
        },
    };
}

function snakeBehaviorById(state) {
    return new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
}

function snakeChainOptions() {
    const config = getSnakeGameConfig();
    return {
        segmentCount: config.segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.linkSlack,
        ballType: config.segmentPropId,
        headBallType: config.headPropId,
        growDirX: config.growDirX,
        growDirY: config.growDirY,
    };
}

describe("snakeAutosim", () => {
    it("eating a shard removes it and adds a chain segment", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 }, { foodValue: getSnakeGameConfig().metabolism.growthCost });
        const behaviorById = snakeBehaviorById(state);
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.equal(state.kinetic.kineticConstraints.length, 3);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 4);
        assert.equal(countLiveFoodShards(state), 0);
        assert.equal(findSnakeFoodProp(state), null);
        assert.equal(state.entityRegistry.get(food.id), null);
    });

    it("eating scales the chain before adding the new segment", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 }, { foodValue: getSnakeGameConfig().metabolism.growthCost });
        const behaviorById = snakeBehaviorById(state);
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        const members = getChainMemberIds(state, chain.head.id).map((id) => state.entityRegistry.getLive(id));
        for (let i = 0; i < members.length; i++) assert.equal(getCirclePropRadius(members[i]), 2);
    });

    it("does not re-eat a consumed shard on consecutive ticks when head stays on the cell", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 }, { foodValue: getSnakeGameConfig().metabolism.growthCost });
        const autosim = createWiredSnakeAutosim(state, {
            headId: chain.head.id,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 4);
        autosim.tick(FRAME_MS);
        autosim.tick(FRAME_MS);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 4);
    });

    it("grows from the current live tail when the cached tail was removed", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeAutosimTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...snakeChainOptions(), segmentCount: 4 });
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 }, { foodValue: getSnakeGameConfig().metabolism.growthCost });
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, eatRadius: 20, rng: () => 0 });
        autosim.start();
        removeSandboxWorldProp(state, chain.tail);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 3);
        chain.head.x = food.x;
        chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        assert.equal(getChainMemberIds(state, chain.head.id).length, 4);
    });
});

function countLiveFoodShards(state) {
    let count = 0;
    for (let i = 0; i < state.worldProps.length; i++) if (!state.worldProps[i].isDead && state.worldProps[i].type === SNAKE_SHARD_PROP_ID) count++;
    return count;
}
