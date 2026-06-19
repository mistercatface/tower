import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { pickSnakeIntentPolicy, pickSnakeIntentTarget, perceiveSnakeIntentWorld } from "../Libraries/Game/snake/snakeIntent.js";
import { createWiredSnakeAutosim, createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";

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
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: { settings: {}, onObstaclesChanged: async () => {} },
        hpaPathWorker: { getPathSlot: () => null, releaseOwnedPathSlot: () => {} },
    };
}

function snakeBehaviors(state) {
    return new Map([
        [HPA_GROUND_NAV_BEHAVIOR_ID, createHpaGroundNavBehavior(state)],
        [DIRECT_GROUND_NAV_BEHAVIOR_ID, createDirectGroundNavBehavior(state)],
    ]);
}

function chainOptions(segmentCount) {
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
    };
}

describe("snake forage intent", () => {
    it("pickSnakeIntentPolicy explores when no food is visible", () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const world = perceiveSnakeIntentWorld(self.head, state, () => null);
        assert.equal(pickSnakeIntentPolicy(world).mode, "explore");
    });

    it("pickSnakeIntentTarget seeks visible food", () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const food = { id: 999, x: self.head.x + 32, y: self.head.y, isDead: false };
        state.worldProps.push(food);
        state.entityRegistry.register("worldProp", food);
        const choice = pickSnakeIntentTarget(self.head, state, () => food);
        assert.equal(choice.mode, "seek_food");
        assert.equal(choice.target.id, 999);
    });

    it("larger visible snakes do not change forage mode", () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const small = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(3));
        const large = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, small.head.id);
        registerAliveSnake(registry, large.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        small.head.facing = 0;
        large.head.x = small.head.x + 80;
        large.head.y = small.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        assert.notEqual(autosim.getMode(), "seek_prey");
        assert.ok(autosim.getMode() === "explore" || autosim.getMode() === "seek_food");
    });
});
