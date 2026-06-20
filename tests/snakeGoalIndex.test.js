import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createSnakeLifecycleRegistry, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { countLiveSnakeGoals, findNearestVisibleSnakeGoal, removeSnakeGoalProp } from "../Libraries/Game/snake/snakeGoals.js";
import { spawnGoalOrbAtCell } from "../Libraries/Game/snake/snakeScene.js";
import { createSnakeNavWalkable, wireSnakeTestNavSession } from "./harness/snakeGameHarness.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { countSnakeGoals, createSnakeGoalIndex, rebuildSnakeGoalIndex } from "../Libraries/Game/snake/snakeGoalIndex.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";

loadPropAssets();

function createGoalIndexState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 16 * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        navigation: {},
        viewport: { isVisible: () => true },
    };
    wireSnakeTestNavSession(state);
    const navWalkable = createSnakeNavWalkable(state);
    wireSnakeGameRegistry(state, createSnakeLifecycleRegistry(), new Map(), navWalkable);
    return state;
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

describe("snake goal index", () => {
    it("tracks spawn and removal through the index", () => {
        const state = createGoalIndexState();
        const goal = spawnGoalOrbAtCell(state, { col: 8, row: 8 });
        assert.equal(countLiveSnakeGoals(state), 1);
        removeSnakeGoalProp(state, goal);
        assert.equal(countLiveSnakeGoals(state), 0);
    });

    it("rebuildSnakeGoalIndex picks up existing goal props", () => {
        const state = createGoalIndexState();
        const goal = spawnGoalOrbAtCell(state, { col: 4, row: 4 });
        state.sandbox.snakeGame.goalIndex = createSnakeGoalIndex();
        rebuildSnakeGoalIndex(state);
        assert.equal(countSnakeGoals(state.sandbox.snakeGame.goalIndex), 1);
        assert.ok(state.sandbox.snakeGame.goalIndex.byId.has(goal.id));
    });
});

describe("snake visible goal parity", () => {
    it("matches cone and LOS visibility through the goal index", () => {
        applySnakeGameConfig();
        const state = createGoalIndexState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, {
            segmentCount: config.segmentCount,
            spacing: resolveSnakeSegmentSpacing(config, config.startRadius),
            segmentRadius: config.startRadius,
            linkSlack: config.linkSlack,
            ballType: config.segmentPropId,
            headBallType: config.headPropId,
            growDirX: config.growDirX,
            growDirY: config.growDirY,
        });
        spawnGoalOrbAtCell(state, { col: 12, row: 8 });
        const visible = spawnGoalOrbAtCell(state, { col: 6, row: 8 });
        stampWall(state.obstacleGrid, 11, 8);
        const seeker = chain.head;
        seeker.facing = Math.PI;
        assert.equal(findNearestVisibleSnakeGoal(state, seeker).id, visible.id);
    });
});
