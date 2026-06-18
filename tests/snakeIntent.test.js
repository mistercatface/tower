import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellChebyshevDistance, pickExploreDestination } from "../Libraries/Navigation/steering/exploreSteering.js";
import { createSpatialCellMemory } from "../Libraries/AI/brain/spatialCellMemory.js";
import { createSnakeAutosim } from "../Libraries/Game/snake/snakeAutosim.js";
import { findNearestSnakeGoal, findNearestVisibleSnakeGoal } from "../Libraries/Game/snake/snakeGoals.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDirectGroundNavBehavior } from "../Libraries/Sandbox/groundNav/directGroundNavBehavior.js";
import { createHpaGroundNavBehavior } from "../Libraries/Sandbox/groundNav/hpaGroundNavBehavior.js";
import { DIRECT_GROUND_NAV_BEHAVIOR_ID, HPA_GROUND_NAV_BEHAVIOR_ID } from "../Libraries/Sandbox/groundNav/groundNavIds.js";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { spawnGoalOrbAtCell } from "../Libraries/Game/snake/snakeScene.js";
import { collectOpenCavernCells } from "../Libraries/Sandbox/cavernFloorCells.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";

loadPropAssets();

function createIntentTestState(cols = 32, rows = 32) {
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

describe("explore steering", () => {
    it("pickExploreDestination respects minimum tile distance", () => {
        const state = createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = collectOpenCavernCells(state);
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 8, openCells, rng: () => 0 });
        assert.ok(cell);
        assert.ok(cellChebyshevDistance(10, 10, cell.col, cell.row) >= 8);
    });

    it("prefers destinations outside spatial memory", () => {
        const state = createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = collectOpenCavernCells(state);
        const memory = createSpatialCellMemory({ capacity: 64 });
        memory.stamp(18, 10);
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 8, memory, openCells, rng: () => 0 });
        assert.ok(cell);
        assert.ok(!memory.has(cell.col, cell.row));
    });

    it("prefers fresh cells over recently remembered cells", () => {
        const state = createIntentTestState();
        const grid = state.obstacleGrid;
        const openCells = collectOpenCavernCells(state);
        const memory = createSpatialCellMemory({ capacity: 8 });
        memory.stamp(12, 10);
        const cell = pickExploreDestination(grid, 10, 10, { minTiles: 1, memory, openCells, rng: () => 0 });
        assert.ok(cell);
        assert.ok(!memory.has(cell.col, cell.row));
    });
});

describe("snake intent FSM", () => {
    it("seeks nearest visible goal, not nearest goal behind a wall", () => {
        applySnakeGameConfig();
        const state = createIntentTestState();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, snakeChainOptions());
        const nearBehindWall = spawnGoalOrbAtCell(state, { col: 12, row: 8 });
        const farVisible = spawnGoalOrbAtCell(state, { col: 6, row: 8 });
        stampWall(state.obstacleGrid, 11, 8);
        const seeker = chain.head;
        seeker.facing = Math.PI;
        assert.equal(findNearestSnakeGoal(state, seeker.x, seeker.y).id, nearBehindWall.id);
        assert.equal(findNearestVisibleSnakeGoal(state, seeker).id, farVisible.id);
    });

    it("explores via HPA when no goal is visible and seeks when food enters vision", () => {
        applySnakeGameConfig();
        resetKineticConstraintIds(1);
        const state = createIntentTestState();
        const chain = spawnLinkedBallChain(state, { col: 4, row: 8 }, snakeChainOptions());
        spawnGoalOrbAtCell(state, { col: 7, row: 8 });
        spawnGoalOrbAtCell(state, { col: 14, row: 8 });
        stampWall(state.obstacleGrid, 5, 8);
        stampWall(state.obstacleGrid, 6, 8);
        stampWall(state.obstacleGrid, 7, 8);
        stampWall(state.obstacleGrid, 8, 8);
        const behaviorById = snakeBehaviors(state);
        const hpa = behaviorById.get(HPA_GROUND_NAV_BEHAVIOR_ID);
        const direct = behaviorById.get(DIRECT_GROUND_NAV_BEHAVIOR_ID);
        const autosim = createSnakeAutosim(state, { headId: chain.head.id, behaviorById, eatRadius: 20, rng: () => 0 });
        autosim.start();
        assert.equal(autosim.getMode(), "explore");
        assert.ok(hpa.hasMoveTarget(chain.head));
        assert.ok(!direct.hasMoveTarget(chain.head));
        chain.head.x = state.obstacleGrid.gridToWorld(10, 8).x;
        chain.head.y = state.obstacleGrid.gridToWorld(10, 8).y;
        autosim.tick(1 / 60);
        assert.equal(autosim.getMode(), "seek");
        assert.ok(hpa.hasMoveTarget(chain.head));
    });
});
