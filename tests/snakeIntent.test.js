import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellChebyshevDistance, pickExploreDestination } from "../Libraries/Navigation/steering/exploreSteering.js";
import { createSpatialCellMemory } from "../Libraries/AI/brain/brain.js";
import { wireSnakeGameForHead, createWiredSnakeAutosim, primeSnakeHeadVision, wireSnakeTestGame, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { pickFleeCell } from "../Libraries/AI/steering/pickFleeCell.js";
import { FRAME_MS } from "./frameMs.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { isEdibleSnakeFoodForSeeker } from "../Libraries/Game/snake/snakeFood.js";
import { resolveVisibleCategoryInVision } from "../Libraries/AI/perception/agentWorldPerception.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { requireSnakeVisionFrame, beginSnakePerceptionFrame, endSnakePerceptionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { getVisionFullBuildCount, resetVisionFullBuildCount } from "../Libraries/Navigation/perception/observerVisionFrame.js";
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
import { perceiveAgentWorld } from "../Libraries/AI/perception/agentWorldPerception.js";
import { buildTestAgentPerceptionOptions } from "./harness/snakeGameHarness.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
function findNearestVisibleSnakeFood(state, seeker) {
    const frame = requireSnakeVisionFrame(state);
    const index = getPropCategoryIndex(state, "food");
    return resolveVisibleCategoryInVision(index, seeker, frame, frame.visionRange, isEdibleSnakeFoodForSeeker);
}
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
        segmentCount: config.agentProfiles.snake.segmentCount,
        spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
        segmentRadius: config.startRadius,
        linkSlack: config.agentProfiles.snake.linkSlack,
        ballType: config.agentProfiles.snake.bodyPropId,
        headBallType: config.agentProfiles.snake.headPropId,
        growDirX: config.agentProfiles.snake.growDirX,
        growDirY: config.agentProfiles.snake.growDirY,
    };
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
describe("snake intent integration", () => {
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
        assert.equal(getPropCategoryIndex(state, "food").findNearest(seeker.x, seeker.y).id, nearBehindWall.id);
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
        const autosim = createWiredSnakeAutosim(state, { headId: chain.head.id, eatRadius: 20 });
        autosim.start();
        assert.equal(autosim.getMode(), "explore");
        assert.ok(autosim.getDestination());
        chain.head.x = state.obstacleGrid.gridToWorld(10, 8).x;
        chain.head.y = state.obstacleGrid.gridToWorld(10, 8).y;
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "seek_food");
        assert.ok(autosim.getDestination());
    });
    it("autosim flees from a visible larger snake", async () => {
        applySnakeGameConfig({ shared: { fleeRange: 128 } });
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
        const autosim = createWiredSnakeAutosim(state, { headId: small.head.id });
        autosim.start();
        autosim.tick(FRAME_MS);
        assert.equal(autosim.getMode(), "flee");
    });
    it("pickFleeCell steps away from the threat", async () => {
        applySnakeGameConfig({ shared: { fleeTiles: 3, fleeRange: 128 } });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const navWalkable = { has: () => true };
        const grid = state.obstacleGrid;
        const config = getSnakeGameConfig();
        const selfCell = { col: 22, row: 20 };
        const threatCell = { col: 26, row: 20 };
        const selfWorld = grid.gridToWorld(selfCell.col, selfCell.row);
        const threatWorld = grid.gridToWorld(threatCell.col, threatCell.row);
        const cell = pickFleeCell(selfWorld, threatWorld, grid, navWalkable, config.shared.fleeTiles);
        assert.ok(cell);
        assert.deepEqual(cell, { col: 19, row: 20 });
    });
    it("ignores smaller snakes hidden behind walls", async () => {
        applySnakeGameConfig({ shared: { fleeRange: 128 } });
        resetKineticConstraintIds(1);
        const state = await createIntentTestState();
        const seekerChain = spawnLinkedBallChain(state, { col: 10, row: 10 }, { ...snakeChainOptions(), segmentCount: 5 });
        const preyChain = spawnLinkedBallChain(state, { col: 12, row: 10 }, { ...snakeChainOptions(), segmentCount: 3 });
        wireSnakeTestGame(state, [
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
        const instance = state.sandbox.snakeGame.instancesByHeadId.get(seeker.id);
        const agentCtx = { instance, session: state.sandbox.snakeGame, navWalkable: state.sandbox.snakeGame.navWalkable };
        const shared = getSnakeGameConfig().shared;
        const options = buildTestAgentPerceptionOptions(shared.visionRange, shared, agentCtx, null);
        const world = perceiveAgentWorld(seeker, agentCtx, state, () => null, shared.visionRange, options);
        assert.equal(world.prey, null);
    });
    it("uses a single head vision build per perceive and caches cellSet", async () => {
        resetVisionFullBuildCount();
        const state = await createIntentTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 10 }, snakeChainOptions());
        wireSnakeGameForHead(state, chain.head.id, chain.spawnGroupId);
        const seeker = chain.head;
        const instance = state.sandbox.snakeGame.instancesByHeadId.get(seeker.id);
        const agentCtx = { instance, session: state.sandbox.snakeGame, navWalkable: state.sandbox.snakeGame.navWalkable };
        assert.equal(getVisionFullBuildCount(), 0);
        beginSnakePerceptionFrame(state);
        const foodResolver = (seeker, state, { frame, visionRange, vision }) => {
            const index = getPropCategoryIndex(state, "food");
            return resolveVisibleCategoryInVision(index, seeker, frame, visionRange, () => true, null, 1.0, vision);
        };
        const shared = getSnakeGameConfig().shared;
        const options = buildTestAgentPerceptionOptions(shared.visionRange, shared, agentCtx, null);
        perceiveAgentWorld(seeker, agentCtx, state, { food: foodResolver }, shared.visionRange, options);
        endSnakePerceptionFrame(state);
        assert.equal(getVisionFullBuildCount(), 1);
        const frame = requireSnakeVisionFrame(state);
        const vision = frame.readHeadVision(seeker);
        assert.ok(vision.cellSet instanceof Set);
        assert.ok(vision.cellSet.size >= 0);
    });
});
