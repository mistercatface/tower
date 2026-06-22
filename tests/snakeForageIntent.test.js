import "./nodeCanvasSetup.js";
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
import { cellChebyshevDistance } from "../Libraries/Navigation/steering/exploreSteering.js";
import { createSnakeDecisionBlackboard, pickSnakeIntentPolicy } from "../Libraries/Game/snake/snakeDecisionModel.js";
import { perceiveSnakeIntentWorld } from "../Libraries/Game/snake/snakeIntent.js";
import { findNearestVisibleThreat, perceiveAgentWorld } from "../Libraries/AI/perception/agentWorldPerception.js";
import { requireSnakeVisionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { resolveAgentRelationship } from "../Libraries/Game/snake/snakeAgentSession.js";
import { pickFleeCell } from "../Libraries/AI/steering/pickFleeCell.js";
import { createWiredSnakeAutosim, createSnakeNavWalkable, primeSnakeHeadVision, registerSnakeTestInstance, wireSnakeTestGame } from "./harness/snakeGameHarness.js";
import { FRAME_MS } from "./frameMs.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
loadPropAssets();
async function createTestState(cols = 32, rows = 32) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    cavernConfig.boundsCol = 0;
    cavernConfig.boundsRow = 0;
    cavernConfig.boundsCols = cols;
    cavernConfig.boundsRows = rows;
    const navigation = await createWorkerNavigation(grid);
    return {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav: navigation,
        viewport: { circleInBounds: () => true },
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
function wireSnakeIntentPerception(state) {
    wireSnakeTestGame(state);
}
function assignIntentFactions(chains) {
    for (const { chain, faction } of chains) chain.head.faction = faction;
}
function registerIntentSnakes(state, chains) {
    const snakeGame = state.sandbox.snakeGame;
    for (const chain of chains) {
        registerSnakeTestInstance(state, snakeGame, { headId: chain.head.id, spawnGroupId: chain.spawnGroupId });
    }
}
function perceiveIntentWorld(state, seeker, headId, registry, resolveFood) {
    primeSnakeHeadVision(state, seeker);
    const config = getSnakeGameConfig();
    return perceiveAgentWorld(seeker, headId, state, registry, resolveFood, config.visionCone, {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: config.fleeRange ?? config.visionCone.range,
        resolveRelationship: (selfHeadId, headId, state) => resolveAgentRelationship(state.sandbox.snakeGame, selfHeadId, headId, state),
    });
}
function pickPolicyFromVisibleWorld(world) {
    return pickSnakeIntentPolicy(createSnakeDecisionBlackboard({ visibleWorld: world }));
}
describe("snake forage intent", () => {
    it("pickSnakeIntentPolicy explores when no food or threat", async () => {
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        registerIntentSnakes(state, [self]);
        const registry = state.sandbox.snakeGame.registry;
        const world = perceiveIntentWorld(state, self.head, self.head.id, registry, () => null);
        assert.equal(pickPolicyFromVisibleWorld(world).mode, "explore");
    });
    it("pickSnakeIntentPolicy flees from a visible larger snake", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(6));
        registerIntentSnakes(state, [self, larger]);
        assignIntentFactions([
            { chain: self, faction: "red" },
            { chain: larger, faction: "blue" },
        ]);
        const registry = state.sandbox.snakeGame.registry;
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        const world = perceiveIntentWorld(state, self.head, self.head.id, registry, () => null);
        assert.equal(pickPolicyFromVisibleWorld(world).mode, "flee");
    });
    it("pickSnakeIntentPolicy flees from a larger snake behind the seeker", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(6));
        registerIntentSnakes(state, [self, larger]);
        assignIntentFactions([
            { chain: self, faction: "red" },
            { chain: larger, faction: "blue" },
        ]);
        const registry = state.sandbox.snakeGame.registry;
        self.head.facing = 0;
        larger.head.x = self.head.x - 64;
        larger.head.y = self.head.y;
        const world = perceiveIntentWorld(state, self.head, self.head.id, registry, () => null);
        assert.equal(pickPolicyFromVisibleWorld(world).mode, "flee");
    });
    it("pickSnakeIntentPolicy prefers flee over visible food", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 14, row: 10 }, chainOptions(6));
        registerIntentSnakes(state, [self, larger]);
        assignIntentFactions([
            { chain: self, faction: "red" },
            { chain: larger, faction: "blue" },
        ]);
        const registry = state.sandbox.snakeGame.registry;
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        const food = { id: 999, x: self.head.x + 32, y: self.head.y, isDead: false };
        const world = perceiveIntentWorld(state, self.head, self.head.id, registry, () => food);
        assert.equal(pickPolicyFromVisibleWorld(world).mode, "flee");
    });
    it("decision policy seeks visible food when no threat", async () => {
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 10, row: 10 }, chainOptions(3));
        registerIntentSnakes(state, [self]);
        const registry = state.sandbox.snakeGame.registry;
        const food = { id: 999, x: self.head.x + 32, y: self.head.y, isDead: false };
        state.worldProps.push(food);
        state.entityRegistry.register("worldProp", food);
        primeSnakeHeadVision(state, self.head);
        const world = perceiveSnakeIntentWorld(self.head, self.head.id, state, registry, () => food);
        const policy = pickPolicyFromVisibleWorld(world);
        assert.equal(policy.mode, "seek_food");
        assert.equal(policy.targetId, 999);
    });
    it("pickFleeCell steps away from the threat", async () => {
        applySnakeGameConfig({ fleeTiles: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const self = spawnLinkedBallChain(state, { col: 22, row: 20 }, chainOptions(3));
        const larger = spawnLinkedBallChain(state, { col: 26, row: 20 }, chainOptions(6));
        registerIntentSnakes(state, [self, larger]);
        assignIntentFactions([
            { chain: self, faction: "red" },
            { chain: larger, faction: "blue" },
        ]);
        const registry = state.sandbox.snakeGame.registry;
        const navWalkable = state.sandbox.snakeGame.navWalkable;
        const grid = state.obstacleGrid;
        self.head.facing = 0;
        larger.head.x = self.head.x + 64;
        larger.head.y = self.head.y;
        primeSnakeHeadVision(state, self.head);
        const config = getSnakeGameConfig();
        const threat = findNearestVisibleThreat(self.head, self.head.id, state, registry, config.visionCone, {
            readVisionFrame: requireSnakeVisionFrame,
            agentRange: config.fleeRange ?? config.visionCone.range,
            resolveRelationship: (selfHeadId, headId, state) => resolveAgentRelationship(state.sandbox.snakeGame, selfHeadId, headId, state),
        });
        const cell = pickFleeCell(self.head, threat, grid, navWalkable, getSnakeGameConfig().fleeTiles);
        assert.ok(cell);
        const selfCell = grid.worldToGrid(self.head.x, self.head.y);
        const threatCell = grid.worldToGrid(larger.head.x, larger.head.y);
        assert.ok(cellChebyshevDistance(cell.col, cell.row, threatCell.col, threatCell.row) > cellChebyshevDistance(selfCell.col, selfCell.row, threatCell.col, threatCell.row));
    });
    it("smaller snake flees when a larger head is visible", async () => {
        applySnakeGameConfig({ fleeRange: 128, fleeTiles: 3 });
        resetKineticConstraintIds(1);
        const state = await createTestState();
        wireSnakeIntentPerception(state);
        const small = spawnLinkedBallChain(state, { col: 22, row: 20 }, chainOptions(3));
        const large = spawnLinkedBallChain(state, { col: 26, row: 20 }, chainOptions(6));
        registerIntentSnakes(state, [small, large]);
        assignIntentFactions([
            { chain: small, faction: "red" },
            { chain: large, faction: "blue" },
        ]);
        small.head.facing = 0;
        large.head.x = small.head.x + 80;
        large.head.y = small.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
        assert.ok(autosim.getDestination());
    });
});
