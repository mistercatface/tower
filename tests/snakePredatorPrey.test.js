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
import { createSnakeLifecycleRegistry, registerAliveSnake } from "../Libraries/Game/snake/snakeLifecycle.js";
import { getSnakeSizeScore } from "../Libraries/Game/snake/snakeScale.js";
import {
    findNearestVisibleSnakePrey,
    findNearestVisibleSnakeThreat,
    pickSnakeIntentTarget,
    resolveFleeNavTarget,
} from "../Libraries/Game/snake/snakePredatorPrey.js";
import { findNearestVisibleSnakeGoal } from "../Libraries/Game/snake/snakeGoals.js";
import { resolvePlayerSnakeCombatHud } from "../Libraries/Game/snake/snakeCombatHud.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
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

describe("snake predator prey perception", () => {
    it("findNearestVisibleSnakePrey ignores equal or larger snakes", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, preySizeRatio: 1 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(4));
        const smaller = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(3));
        const equal = spawnLinkedBallChain(state, { col: 10, row: 14 }, chainOptions(4));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, smaller.head.id);
        registerAliveSnake(registry, equal.head.id);
        self.head.facing = 0;
        smaller.head.x = self.head.x + 48;
        smaller.head.y = self.head.y;
        equal.head.x = self.head.x + 48;
        equal.head.y = self.head.y + 48;
        const prey = findNearestVisibleSnakePrey(state, self.head, self.head.id, registry);
        assert.ok(prey);
        assert.equal(prey.id, smaller.head.id);
        assert.ok(getSnakeSizeScore(state, prey.id) < getSnakeSizeScore(state, self.head.id));
    });

    it("findNearestVisibleSnakeThreat detects larger visible heads", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, fleeRange: 128 });
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
        const threat = findNearestVisibleSnakeThreat(state, self.head, self.head.id, registry);
        assert.ok(threat);
        assert.equal(threat.id, larger.head.id);
    });

    it("pickSnakeIntentTarget prefers flee over food and prey", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, huntPriority: 0.9, fleeRange: 128 });
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
        const resolveVisibleFood = () => ({ id: 999, x: self.head.x + 32, y: self.head.y });
        const choice = pickSnakeIntentTarget(self.head, self.head.id, state, registry, resolveVisibleFood);
        assert.equal(choice.mode, "flee");
        assert.equal(choice.target.id, larger.head.id);
    });

    it("resolveFleeNavTarget points away from the threat", () => {
        applySnakeGameConfig();
        const state = createTestState();
        const seeker = { x: 100, y: 100 };
        const threat = { x: 130, y: 100 };
        const target = resolveFleeNavTarget(seeker, threat, 96, state);
        assert.ok(target.x < seeker.x);
        assert.ok(Math.abs(target.y - seeker.y) <= state.obstacleGrid.cellSize);
    });
});

describe("snake predator prey autosim", () => {
    it("smaller snake flees when larger head is visible", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const prey = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(3));
        const predator = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, prey.head.id);
        registerAliveSnake(registry, predator.head.id);
        state.sandbox.snakeGame = { registry, autosimsByHeadId: new Map() };
        prey.head.facing = 0;
        predator.head.x = prey.head.x + 80;
        predator.head.y = prey.head.y;
        const autosim = createSnakeAutosim(state, { headId: prey.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        assert.equal(autosim.getMode(), "flee");
    });

    it("larger snake seeks prey when huntPriority beats nearby food", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, huntPriority: 0.95, fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, predator.head.id);
        registerAliveSnake(registry, prey.head.id);
        state.sandbox.snakeGame = { registry, autosimsByHeadId: new Map() };
        predator.head.facing = 0;
        prey.head.x = predator.head.x + 80;
        prey.head.y = predator.head.y;
        const autosim = createSnakeAutosim(state, { headId: predator.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        assert.equal(autosim.getMode(), "seek_prey");
    });

    it("resolvePlayerSnakeCombatHud reports hunting and hunted states", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true, huntPriority: 0.95, fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, predator.head.id);
        registerAliveSnake(registry, prey.head.id);
        const autosimsByHeadId = new Map();
        state.sandbox.snakeGame = { registry, autosimsByHeadId };
        predator.head.facing = 0;
        prey.head.facing = 0;
        prey.head.x = predator.head.x + 80;
        prey.head.y = predator.head.y;
        const predatorAutosim = createSnakeAutosim(state, { headId: predator.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        const preyAutosim = createSnakeAutosim(state, { headId: prey.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosimsByHeadId.set(predator.head.id, predatorAutosim);
        autosimsByHeadId.set(prey.head.id, preyAutosim);
        predatorAutosim.start();
        preyAutosim.start();
        predatorAutosim.tick(1 / 60);
        preyAutosim.tick(1 / 60);
        assert.deepEqual(resolvePlayerSnakeCombatHud(predator.head.id, registry, autosimsByHeadId), { hunting: true, hunted: false, foraging: false });
        assert.deepEqual(resolvePlayerSnakeCombatHud(prey.head.id, registry, autosimsByHeadId), { hunting: false, hunted: true, foraging: false });
    });

    it("resolvePlayerSnakeCombatHud shows foraging when seeking food or exploring", () => {
        applySnakeGameConfig({ predatorPreyEnabled: true });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, snake.head.id);
        const autosimsByHeadId = new Map();
        state.sandbox.snakeGame = { registry, autosimsByHeadId };
        const autosim = createSnakeAutosim(state, { headId: snake.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosimsByHeadId.set(snake.head.id, autosim);
        autosim.start();
        autosim.tick(1 / 60);
        assert.deepEqual(resolvePlayerSnakeCombatHud(snake.head.id, registry, autosimsByHeadId), { hunting: false, hunted: false, foraging: true });
    });
});
