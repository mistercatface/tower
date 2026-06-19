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
import { getSnakeSizeScore } from "../Libraries/Game/snake/snakeScale.js";
import {
    collectVisibleSnakeThreats,
    findNearestVisibleSnakePrey,
    findNearestVisibleSnakeThreat,
    pickRetreatDestination,
    pickSnakeIntentTarget,
} from "../Libraries/Game/snake/snakePredatorPrey.js";
import { findNearestVisibleSnakeGoal } from "../Libraries/Game/snake/snakeGoals.js";
import { resolvePlayerSnakeCombatHud } from "../Libraries/Game/snake/snakeCombatHud.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { cellChebyshevDistance } from "../Libraries/Navigation/steering/exploreSteering.js";

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
        applySnakeGameConfig({ preySizeRatio: 1 });
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
        const threat = findNearestVisibleSnakeThreat(state, self.head, self.head.id, registry);
        assert.ok(threat);
        assert.equal(threat.id, larger.head.id);
    });

    it("pickSnakeIntentTarget prefers flee over food and prey", () => {
        applySnakeGameConfig({ huntPriority: 0.9, fleeRange: 128 });
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
        assert.equal(choice.target, null);
    });

    it("pickRetreatDestination maximizes distance from visible threats", () => {
        applySnakeGameConfig({ fleeRange: 256, exploreMinTiles: 4 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const threat = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, self.head.id);
        registerAliveSnake(registry, threat.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        self.head.facing = 0;
        threat.head.x = self.head.x + 64;
        threat.head.y = self.head.y;
        const threats = collectVisibleSnakeThreats(state, self.head, self.head.id, registry);
        assert.equal(threats.length, 1);
        const cell = pickRetreatDestination(self.head, state, registry, self.head.id, null, () => 0, state.sandbox.snakeGame.navWalkable);
        assert.ok(cell);
        const grid = state.obstacleGrid;
        const threatCell = grid.worldToGrid(threat.head.x, threat.head.y);
        assert.ok(cellChebyshevDistance(cell.col, cell.row, threatCell.col, threatCell.row) >= 4);
    });
});

describe("snake predator prey autosim", () => {
    it("smaller snake flees when larger head is visible", () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const prey = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(3));
        const predator = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, prey.head.id);
        registerAliveSnake(registry, predator.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        prey.head.facing = 0;
        predator.head.x = prey.head.x + 80;
        predator.head.y = prey.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: prey.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        assert.equal(autosim.getMode(), "flee");
        assert.ok(autosim.getDestination());
    });

    it("flee holds latched retreat cell while two visible threats remain", () => {
        applySnakeGameConfig({ fleeRange: 256, exploreMinTiles: 4, fleeThreatClearTicks: 20 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const prey = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const threatA = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(5));
        const threatB = spawnLinkedBallChain(state, { col: 10, row: 16 }, chainOptions(5));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, prey.head.id);
        registerAliveSnake(registry, threatA.head.id);
        registerAliveSnake(registry, threatB.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        prey.head.facing = 0;
        threatA.head.x = prey.head.x + 80;
        threatA.head.y = prey.head.y;
        threatB.head.x = prey.head.x;
        threatB.head.y = prey.head.y + 80;
        const autosim = createWiredSnakeAutosim(state, { headId: prey.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        const latched = autosim.getDestination();
        assert.ok(latched);
        for (let i = 0; i < 40; i++) {
            threatA.head.x = prey.head.x + 80 + (i % 2 === 0 ? 16 : -16);
            autosim.tick(1 / 60);
            assert.equal(autosim.getMode(), "flee");
            const dest = autosim.getDestination();
            assert.ok(dest);
            assert.equal(dest.col, latched.col);
            assert.equal(dest.row, latched.row);
        }
    });

    it("larger snake seeks prey when huntPriority beats nearby food", () => {
        applySnakeGameConfig({ huntPriority: 0.95, fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, predator.head.id);
        registerAliveSnake(registry, prey.head.id);
        wireSnakeGameRegistry(state, registry, new Map(), createSnakeNavWalkable(state));
        predator.head.facing = 0;
        prey.head.x = predator.head.x + 80;
        prey.head.y = predator.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: predator.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(1 / 60);
        assert.equal(autosim.getMode(), "seek_prey");
        const preyCell = state.obstacleGrid.worldToGrid(prey.head.x, prey.head.y);
        assert.deepEqual(autosim.getDestination(), { col: preyCell.col, row: preyCell.row, world: state.obstacleGrid.gridToWorld(preyCell.col, preyCell.row) });
    });

    it("resolvePlayerSnakeCombatHud reports hunting and hunted states", () => {
        applySnakeGameConfig({ huntPriority: 0.95, fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = createTestState();
        const predator = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(5));
        const prey = spawnLinkedBallChain(state, { col: 16, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, predator.head.id);
        registerAliveSnake(registry, prey.head.id);
        const autosimsByHeadId = new Map();
        wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
        predator.head.facing = 0;
        prey.head.facing = 0;
        prey.head.x = predator.head.x + 80;
        prey.head.y = predator.head.y;
        const predatorAutosim = createWiredSnakeAutosim(state, { headId: predator.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        const preyAutosim = createWiredSnakeAutosim(state, { headId: prey.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosimsByHeadId.set(predator.head.id, predatorAutosim);
        autosimsByHeadId.set(prey.head.id, preyAutosim);
        predatorAutosim.start();
        preyAutosim.start();
        predatorAutosim.tick(1 / 60);
        preyAutosim.tick(1 / 60);
        assert.deepEqual(resolvePlayerSnakeCombatHud(predator.head.id, state, registry, autosimsByHeadId), { hunting: true, hunted: false, foraging: false });
        assert.deepEqual(resolvePlayerSnakeCombatHud(prey.head.id, state, registry, autosimsByHeadId), { hunting: false, hunted: true, foraging: false });
    });

    it("resolvePlayerSnakeCombatHud shows foraging when seeking food or exploring", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createTestState();
        const snake = spawnLinkedBallChain(state, { col: 8, row: 10 }, chainOptions(3));
        const registry = createSnakeLifecycleRegistry();
        registerAliveSnake(registry, snake.head.id);
        const autosimsByHeadId = new Map();
        wireSnakeGameRegistry(state, registry, autosimsByHeadId, createSnakeNavWalkable(state));
        const autosim = createWiredSnakeAutosim(state, { headId: snake.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosimsByHeadId.set(snake.head.id, autosim);
        autosim.start();
        autosim.tick(1 / 60);
        assert.deepEqual(resolvePlayerSnakeCombatHud(snake.head.id, state, registry, autosimsByHeadId), { hunting: false, hunted: false, foraging: true });
    });
});
