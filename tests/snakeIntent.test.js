import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellChebyshevDistance, pickExploreDestination } from "../Libraries/Navigation/steering/exploreSteering.js";
import { createSpatialCellMemory } from "../Libraries/AI/brain/spatialCellMemory.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, createSnakeNavWalkable, primeSnakeHeadVision, wireSnakeTestGame, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { FRAME_MS } from "./frameMs.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { findNearestSnakeFood, findNearestVisibleSnakeFood } from "../Libraries/Game/snake/snakeFood.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { createSnakeDecisionBlackboard, pickSnakeIntentPolicy } from "../Libraries/Game/snake/snakeDecisionModel.js";
import { syncNavReachHorizon, navReachStepsTo } from "../Libraries/Navigation/navReachHorizon.js";
import { requireSnakeVisionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { perceiveAgentIntentWorld } from "../Libraries/Game/snake/agentIntentPerception.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
async function createIntentTestState(cols = 32, rows = 32) {
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
function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}
function snakeBehaviors(state) {
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
function reachStepsForWorld(seeker, state, world) {
    syncNavReachHorizon(requireSnakeVisionFrame(state).navTopology, seeker.x, seeker.y, getSnakeGameConfig().decisionReachHorizon ?? 32);
    return {
        threat: world.threat ? navReachStepsTo(world.threat.x, world.threat.y) : null,
        prey: world.prey ? navReachStepsTo(world.prey.x, world.prey.y) : null,
        food: world.food ? navReachStepsTo(world.food.x, world.food.y) : null,
        ally: world.ally ? navReachStepsTo(world.ally.x, world.ally.y) : null,
    };
}
function pickPolicyFromVisibleWorld(seeker, state, world) {
    return pickSnakeIntentPolicy(createSnakeDecisionBlackboard({ visibleWorld: world, reachSteps: reachStepsForWorld(seeker, state, world) }));
}
describe("explore steering", () => {
    it("pickExploreDestination respects minimum tile distance", async () => {
        const state = await createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = [
            { col: 11, row: 10 },
            { col: 20, row: 10 },
        ];
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 8, openCells, rng: () => 0.75 });
        assert.ok(cell);
        assert.ok(cellChebyshevDistance(10, 10, cell.col, cell.row) >= 8);
    });
    it("prefers destinations outside spatial memory", async () => {
        const state = await createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = [
            { col: 18, row: 10 },
            { col: 20, row: 10 },
        ];
        const memory = createSpatialCellMemory({ capacity: 64 });
        memory.stamp(18, 10);
        let call = 0;
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 8, memory, openCells, rng: () => (call++ === 0 ? 0 : 0.75) });
        assert.ok(cell);
        assert.ok(!memory.has(cell.col, cell.row));
    });
    it("falls back to a remembered candidate when samples find no fresh cells", async () => {
        const state = await createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = [
            { col: 12, row: 10 },
            { col: 18, row: 10 },
        ];
        const memory = createSpatialCellMemory({ capacity: 8 });
        memory.stamp(12, 10);
        memory.stamp(18, 10);
        let call = 0;
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 1, memory, openCells, rng: () => (call++ === 0 ? 0 : 0.75) });
        assert.ok(cell);
        assert.ok(memory.has(cell.col, cell.row));
        assert.deepEqual(cell, { col: 12, row: 10 });
    });
});
describe("snake intent FSM", () => {
    it("seeks nearest visible shard food, not nearest food behind a wall", async () => {
        applySnakeGameConfig();
        const state = await createIntentTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, snakeChainOptions());
        const nearBehindWall = spawnSnakeFoodShardAtCell(state, { col: 12, row: 8 });
        const farVisible = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        stampWall(state.obstacleGrid, 11, 8);
        await state.nav.commitEdit({ startCol: 10, endCol: 12, startRow: 7, endRow: 9 });
        const seeker = chain.head;
        seeker.facing = Math.PI;
        wireSnakeTestGame(state);
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestSnakeFood(state, seeker.x, seeker.y).id, nearBehindWall.id);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, farVisible.id);
    });
    it("explores via HPA when no goal is visible and seeks when food enters vision", async () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const chain = spawnLinkedBallChain(state, { col: 4, row: 8 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        spawnSnakeFoodShardAtCell(state, { col: 7, row: 8 });
        spawnSnakeFoodShardAtCell(state, { col: 14, row: 8 });
        stampWall(state.obstacleGrid, 5, 8);
        stampWall(state.obstacleGrid, 6, 8);
        stampWall(state.obstacleGrid, 7, 8);
        stampWall(state.obstacleGrid, 8, 8);
        await state.nav.commitEdit({ startCol: 4, endCol: 9, startRow: 7, endRow: 9 });
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, eatRadius: 20, rng: () => 0 });
        autosim.start();
        assert.equal(autosim.getMode(), "explore");
        assert.ok(autosim.getDestination());
        chain.head.x = state.obstacleGrid.gridToWorld(10, 8).x;
        chain.head.y = state.obstacleGrid.gridToWorld(10, 8).y;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assert.ok(autosim.getDestination());
    });
    it("forage intent flees from a visible larger snake", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const small = spawnLinkedBallChain(state, { col: 6, row: 10 }, { ...snakeChainOptions(), segmentCount: 3 });
        const large = spawnLinkedBallChain(state, { col: 14, row: 10 }, { ...snakeChainOptions(), segmentCount: 6 });
        wireSnakeTestGame(state, [
            { headId: small.head.id, spawnGroupId: small.spawnGroupId },
            { headId: large.head.id, spawnGroupId: large.spawnGroupId },
        ]);
        small.head.faction = "red";
        large.head.faction = "blue";
        small.head.facing = 0;
        large.head.x = small.head.x + 80;
        large.head.y = small.head.y;
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id, behaviorById: snakeBehaviors(state), rng: () => 0 });
        autosim.start();
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
    });
    it("perceives nearest visible larger threat and smaller prey in one world view", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const seekerChain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...snakeChainOptions(), segmentCount: 5 });
        const preyChain = spawnLinkedBallChain(state, { col: 14, row: 10 }, { ...snakeChainOptions(), segmentCount: 3 });
        const threatChain = spawnLinkedBallChain(state, { col: 16, row: 10 }, { ...snakeChainOptions(), segmentCount: 8 });
        const { registry } = wireSnakeTestGame(state, [
            { headId: seekerChain.head.id, spawnGroupId: seekerChain.spawnGroupId },
            { headId: preyChain.head.id, spawnGroupId: preyChain.spawnGroupId },
            { headId: threatChain.head.id, spawnGroupId: threatChain.spawnGroupId },
        ]);
        seekerChain.head.faction = "red";
        preyChain.head.faction = "blue";
        threatChain.head.faction = "blue";
        const seeker = seekerChain.head;
        seeker.facing = 0;
        preyChain.head.x = seeker.x + 64;
        preyChain.head.y = seeker.y;
        threatChain.head.x = seeker.x + 96;
        threatChain.head.y = seeker.y;
        primeSnakeHeadVision(state, seeker);
        const world = perceiveAgentIntentWorld(seeker, seeker.id, state, registry, () => null);
        assert.equal(world.prey.id, preyChain.head.id);
        assert.equal(world.threat.id, threatChain.head.id);
        assert.equal(pickPolicyFromVisibleWorld(seeker, state, world).mode, "flee");
    });
    it("prefers visible shard food over live prey when no threat is visible", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const seekerChain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...snakeChainOptions(), segmentCount: 5 });
        const preyChain = spawnLinkedBallChain(state, { col: 14, row: 10 }, { ...snakeChainOptions(), segmentCount: 3 });
        const food = spawnSnakeFoodShardAtCell(state, { col: 12, row: 10 });
        const { registry } = wireSnakeTestGame(state, [
            { headId: seekerChain.head.id, spawnGroupId: seekerChain.spawnGroupId },
            { headId: preyChain.head.id, spawnGroupId: preyChain.spawnGroupId },
        ]);
        seekerChain.head.faction = "red";
        preyChain.head.faction = "blue";
        const seeker = seekerChain.head;
        seeker.facing = 0;
        preyChain.head.x = seeker.x + 64;
        preyChain.head.y = seeker.y;
        primeSnakeHeadVision(state, seeker);
        const world = perceiveAgentIntentWorld(seeker, seeker.id, state, registry, () => food);
        assert.equal(world.prey.id, preyChain.head.id);
        assert.equal(world.food.id, food.id);
        assert.deepEqual(pickPolicyFromVisibleWorld(seeker, state, world), { mode: "seek_food", targetId: food.id });
    });
    it("ignores smaller snakes hidden behind walls", async () => {
        applySnakeGameConfig({ fleeRange: 128 });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const seekerChain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...snakeChainOptions(), segmentCount: 5 });
        const preyChain = spawnLinkedBallChain(state, { col: 12, row: 10 }, { ...snakeChainOptions(), segmentCount: 3 });
        const { registry } = wireSnakeTestGame(state, [
            { headId: seekerChain.head.id, spawnGroupId: seekerChain.spawnGroupId },
            { headId: preyChain.head.id, spawnGroupId: preyChain.spawnGroupId },
        ]);
        seekerChain.head.faction = "red";
        preyChain.head.faction = "blue";
        const seeker = seekerChain.head;
        seeker.facing = 0;
        preyChain.head.x = seeker.x + 32;
        preyChain.head.y = seeker.y;
        stampWall(state.obstacleGrid, 11, 10);
        await state.nav.commitEdit({ startCol: 10, endCol: 12, startRow: 9, endRow: 11 });
        primeSnakeHeadVision(state, seeker);
        const world = perceiveAgentIntentWorld(seeker, seeker.id, state, registry, () => null);
        assert.equal(world.prey, null);
    });
});
