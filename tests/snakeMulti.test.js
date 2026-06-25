import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { getChainMemberIds } from "../Libraries/Sandbox/chainLinks.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { getPropVisualTint, setPropVisualTint } from "../Libraries/Color/visualOverride.js";
import { hueToPickerHex } from "../Libraries/Color/hex.js";
import { pickSnakeChainTintHex } from "../Libraries/Game/snake/snakeChainColor.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { FRAME_MS } from "./frameMs.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSpawnSpecs } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnSnakeChain } from "../Libraries/Game/snake/snakeScene.js";
import { collectFlatPlacedSandboxPropEntries, spawnPlacedSandboxProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";

function createSnakeSceneTestState(cols = 32, rows = 32) {
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

describe("snake multi-spawn", () => {
    it("derives one spawn spec per snakeCount entry", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { populationCount: 3, minAliveSegmentCount: 3, maxAliveSegmentCount: 5 } } });
        const rolls = [0, 0.5, 0.999];
        const specs = resolveSnakeSpawnSpecs(getSnakeGameConfig(), () => rolls.shift());
        assert.deepEqual(specs.map((spec) => spec.segmentCount), [3, 4, 5]);
    });

    it("spawnSnakeChain tints every segment with the same visualOverride tint", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const tintHex = pickSnakeChainTintHex(() => 0.25);
        const pack = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 3, rng: () => 0.25 });
        assert.equal(pack.tintHex, tintHex);
        const memberIds = getChainMemberIds(state, pack.chain.head.id);
        assert.equal(memberIds.length, 3);
        for (let i = 0; i < memberIds.length; i++) {
            const prop = state.entityRegistry.getLive(memberIds[i]);
            assert.equal(getPropVisualTint(prop), tintHex);
        }
    });

    it("two chains get different random tints", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const first = spawnSnakeChain(state, { col: 8, row: 8 }, { segmentCount: 3, rng: () => 0.1 });
        const second = spawnSnakeChain(state, { col: 20, row: 20 }, { segmentCount: 3, excludeIndices: first.occupiedIndices, rng: () => 0.9 });
        assert.notEqual(first.tintHex, second.tintHex);
    });

    it("new segment inherits head tint after eating", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const pack = spawnSnakeChain(state, { col: 10, row: 10 }, { segmentCount: 3, rng: () => 0.5 });
        wireSnakeGameForHead(state, pack.chain.head.id, pack.chain.spawnGroupId);
        const food = spawnSnakeFoodShardAtCell(state, { col: 14, row: 10 }, { foodValue: getSnakeGameConfig().agentProfiles.snake.metabolism.growthCost });
        const behaviorById = new Map([
            [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
            [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
        ]);
        const autosim = createWiredSnakeAutosim(state, {
            headId: pack.chain.head.id,
            behaviorById,
            eatRadius: 20,
            rng: () => 0,
        });
        autosim.start();
        pack.chain.head.x = food.x;
        pack.chain.head.y = food.y;
        autosim.tick(FRAME_MS);
        const memberIds = getChainMemberIds(state, pack.chain.head.id);
        const tail = state.entityRegistry.getLive(memberIds[memberIds.length - 1]);
        assert.equal(getPropVisualTint(tail), pack.tintHex);
    });
});

describe("snake config counts", () => {
    it("applySnakeGameConfig overrides populationCount", () => {
        applySnakeGameConfig({ agentProfiles: { snake: { populationCount: 30, segmentCount: 3 } } });
        assert.equal(getSnakeGameConfig().agentProfiles.snake.populationCount, 30);
        assert.equal(resolveSnakeSpawnSpecs().length, 30);
        applySnakeGameConfig();
    });
});

describe("visualOverride snapshot", () => {
    it("serializes and restores visualOverride on placed props", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createSnakeSceneTestState();
        const prop = spawnPlacedSandboxProp(state, 80, 80, "ball");
        const tintHex = hueToPickerHex(200);
        setPropVisualTint(prop, tintHex);
        const { props } = collectFlatPlacedSandboxPropEntries(state);
        assert.equal(props[0].visualOverride.tint, tintHex);
        const fresh = createSnakeSceneTestState();
        const restored = spawnPlacedSandboxProp(fresh, props[0].x, props[0].y, props[0].type, props[0].faction, props[0].facing, undefined, props[0].visualOverride);
        assert.equal(getPropVisualTint(restored), tintHex);
    });
});
