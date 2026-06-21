import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createSnakeLifecycleRegistry, wireSnakeGameRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { countLiveSnakeFood, findNearestVisibleSnakeFood } from "../Libraries/Game/snake/snakeFood.js";
import { createSnakeNavWalkable, wireSnakeTestNavSession, primeSnakeHeadVision, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { removeSandboxWorldProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";

loadPropAssets();

async function createFoodQueryState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 32 * 16, 16 * 16);
    const cavernConfig = createDefaultMapGenBoundsConfig();
    const nav = await createWorkerNavigation(grid);
    const state = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        editor: { cavernConfig },
        nav,
        viewport: { circleInBounds: () => true },
    };
    wireSnakeTestNavSession(state);
    const navWalkable = createSnakeNavWalkable(state);
    wireSnakeGameRegistry(state, createSnakeLifecycleRegistry(), new Map(), navWalkable);
    return state;
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

describe("snake shard food query", () => {
    it("tracks spawn and removal through the registry query", async () => {
        const state = await createFoodQueryState();
        const food = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        assert.equal(countLiveSnakeFood(state), 1);
        removeSandboxWorldProp(state, food);
        assert.equal(countLiveSnakeFood(state), 0);
    });
});

describe("snake visible shard food parity", () => {
    it("matches cone and LOS visibility through the dynamic food query", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
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
        spawnSnakeFoodShardAtCell(state, { col: 12, row: 8 });
        const visible = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        stampWall(state.obstacleGrid, 11, 8);
        const seeker = chain.head;
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, visible.id);
    });
});
