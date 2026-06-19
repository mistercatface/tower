import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeLifecycleRegistry, registerAliveSnake, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { cellChebyshevDistance } from "../Libraries/Navigation/steering/exploreSteering.js";
import {
    findNearestVisibleThreat,
    pickFleeCell,
    pickSnakeIntentPolicy,
    pickSnakeIntentTarget,
    perceiveSnakeIntentWorld,
} from "../Libraries/Game/snake/snakeIntent.js";
import { createWiredSnakeAutosim, createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { spawnSnakeStriker } from "../Libraries/Game/snake/snakeStriker.js";
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
        kinetic: new KineticSession(),
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
    it("pickSnakeIntentPolicy explores when no food or threat", () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const registry = createSnakeLifecycleRegistry();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        registerAliveSnake(registry, self.head.id);
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => null);
        assert.equal(pickSnakeIntentPolicy(world).mode, "explore");
    });

    it("pickSnakeIntentPolicy flees from a visible larger snake", () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, larger.head.id);
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => null);
        assert.equal(pickSnakeIntentPolicy(world).mode, "flee");
    });

    it("pickSnakeIntentPolicy flees from a larger snake behind the seeker", () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, larger.head.id);
        self.head.facing = 0;
        larger.head.x = self.head.x - 64;
        larger.head.y = self.head.y;
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => null);
        assert.equal(pickSnakeIntentPolicy(world).mode, "flee");
    });

    it("pickSnakeIntentPolicy flees from a visible striker ball", () => {
        applySnakeGameConfig({ fleeRange: 128, strikerPropId: "snake_striker" });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const registry = createSnakeLifecycleRegistry();
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        registerAliveSnake(registry, self.head.id);
        const striker = spawnSnakeStriker(state, self.head);
        state.sandbox.snakeGame.strikerBall = striker;
        striker.x = self.head.x + 64;
        striker.y = self.head.y;
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => null);
        assert.equal(pickSnakeIntentPolicy(world).mode, "flee");
        assert.equal(world.threat.id, striker.id);
    });

    it("pickSnakeIntentPolicy prefers flee over visible food", () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, larger.head.id);
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        const food = { id: 999, x: self.head.x + 32, y: self.head.y, isDead: false };
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => food);
        assert.equal(pickSnakeIntentPolicy(world).mode, "flee");
    });

    it("pickSnakeIntentTarget seeks visible food when no threat", () => {
        resetKineticConstraintIds(1);
        const state = createTestState();
        const registry = createSnakeLifecycleRegistry();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        registerAliveSnake(registry, self.head.id);
        const food = { id: 999, x: self.head.x + 32, y: self.head.y, isDead: false };
        state.worldProps.push(food);
        state.entityRegistry.register("worldProp", food);
        const choice = pickSnakeIntentTarget(self.head, self.head.id, state, registry, () => food);
        assert.equal(choice.mode, "seek_food");
        assert.equal(choice.target.id, 999);
    });

    it("pickFleeCell steps away from the threat", () => {
        applySnakeGameConfig({ fleeTiles: 6 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, larger.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        const navWalkable = state.sandbox.snakeGame.navWalkable;
        const grid = state.obstacleGrid;
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        const threat = findNearestVisibleThreat(self.head, self.head.id, state, registry);
        const cell = pickFleeCell(self.head, threat, grid, navWalkable);
        assert.ok(cell);
        const selfCell = grid.worldToGrid(self.head.x, self.head.y);
        const threatCell = grid.worldToGrid(larger.head.x, larger.head.y);
        assert.ok(cellChebyshevDistance(cell.col, cell.row, threatCell.col, threatCell.row) > cellChebyshevDistance(selfCell.col, selfCell.row, threatCell.col, threatCell.row));
    });

    it("smaller snake flees when a larger head is visible", () => {
        applySnakeGameConfig({ fleeRange: 128 });
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
        assert.equal(autosim.getMode(), "flee");
        assert.ok(autosim.getDestination());
    });
});
