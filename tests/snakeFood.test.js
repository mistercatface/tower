import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { canAgentEatSnakeFood, isEdibleSnakeFoodForSeeker } from "../Libraries/Game/snake/snakeFood.js";
import { resolveVisibleCategoryInVision } from "../Libraries/AI/perception/agentWorldPerception.js";
import { getPropCategoryIndex } from "../GameState/SandboxWorldState.js";
import { requireSnakeVisionFrame } from "../Libraries/Game/snake/snakePerception.js";
import { wireSnakeTestGame, wireSnakeTestNavSession, primeSnakeHeadVision, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { removeSandboxWorldProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { markSnakeSegmentsFracturable } from "../Libraries/Game/snake/snakeSegmentFracture.js";

function findNearestVisibleSnakeFood(state, seeker) {
    const index = getPropCategoryIndex(state, "food");
    return resolveVisibleCategoryInVision(state, seeker, index, isEdibleSnakeFoodForSeeker);
}

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
    wireSnakeTestGame(state);
    return state;
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

function chainOptions(config) {
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

describe("snake shard category index", () => {
    it("tracks spawn and removal through the category index", async () => {
        const state = await createFoodQueryState();
        const food = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        assert.equal(getPropCategoryIndex(state, "food").totalCount(), 1);
        removeSandboxWorldProp(state, food);
        assert.equal(getPropCategoryIndex(state, "food").totalCount(), 0);
    });

    it("reconciles moving shards correctly", async () => {
        const state = await createFoodQueryState();
        const food = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        const index = getPropCategoryIndex(state, "food");
        assert.equal(index.countAtCell(8, 8), 1);
        assert.equal(index.countAtCell(12, 8), 0);

        // Move the shard manually
        const newPos = state.obstacleGrid.gridToWorld(12, 8);
        food.x = newPos.x;
        food.y = newPos.y;

        index.reconcile(food);
        assert.equal(index.countAtCell(8, 8), 0);
        assert.equal(index.countAtCell(12, 8), 1);
    });

    it("supports many shards in a cell and returns the nearest", async () => {
        const state = await createFoodQueryState();
        const index = getPropCategoryIndex(state, "food");
        const food1 = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        const food2 = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        
        // Put food1 slightly closer to the coordinate (120, 120)
        food1.x = 122; food1.y = 120;
        food2.x = 128; food2.y = 120;

        const nearest = index.findNearest(120, 120);
        assert.equal(nearest.id, food1.id);
    });
});

describe("snake visible shard food parity", () => {
    it("matches 360 range and LOS visibility through the category index", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        spawnSnakeFoodShardAtCell(state, { col: 12, row: 8 });
        const visible = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        stampWall(state.obstacleGrid, 11, 8);
        const seeker = chain.head;
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, visible.id);
    });

    it("treats intact fracturable dead segments as visible food targets", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const seekerChain = spawnLinkedBallChain(state, { col: 10, row: 8 }, { ...chainOptions(config), faction: "red" });
        const carcassChain = spawnLinkedBallChain(state, { col: 6, row: 8 }, { ...chainOptions(config), faction: "blue" });
        const carcassSegment = carcassChain.tail;
        markSnakeSegmentsFracturable(state, [carcassSegment.id]);
        const seeker = seekerChain.head;
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, carcassSegment.id);
    });

    it("proves vision relies on coarse category index cell counts (no vision if moved without reconcile)", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        const food = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        
        // Manually shift the food's position without reconciling the category index
        const farPos = state.obstacleGrid.gridToWorld(24, 8);
        food.x = farPos.x;
        food.y = farPos.y;

        const seeker = chain.head;
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);

        const visibleFood = findNearestVisibleSnakeFood(state, seeker);
        assert.equal(visibleFood, null);
    });

    it("never queries the entity registry spatial query (queryView) during visible food resolution", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        const visible = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        const seeker = chain.head;
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);

        let queryViewCalled = false;
        const originalQueryView = state.entityRegistry.queryView;
        state.entityRegistry.queryView = function (...args) {
            queryViewCalled = true;
            return originalQueryView.apply(this, args);
        };

        const visibleFood = findNearestVisibleSnakeFood(state, seeker);
        assert.equal(visibleFood.id, visible.id);
        assert.equal(queryViewCalled, false, "Should not hit entity registry queryView during vision category resolution");

        state.entityRegistry.queryView = originalQueryView;
    });
});

describe("snake food allegiance", () => {
    it("blocks same-faction snakes from eating ally or self shards", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        const seeker = chain.head;
        seeker.faction = "red";
        const allyShard = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        allyShard.faction = "red";
        const enemyShard = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        enemyShard.faction = "blue";
        assert.equal(canAgentEatSnakeFood(seeker, allyShard), false);
        assert.equal(canAgentEatSnakeFood(seeker, enemyShard), true);
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, enemyShard.id);
    });

    it("lets flee agents eat snake shards but not same-faction flee corpses", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        const seeker = chain.head;
        seeker.faction = "bravo";
        const allyShard = spawnSnakeFoodShardAtCell(state, { col: 4, row: 8 });
        allyShard.faction = "bravo";
        const redShard = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        redShard.faction = "red";
        const blueShard = spawnSnakeFoodShardAtCell(state, { col: 8, row: 8 });
        blueShard.faction = "blue";
        assert.equal(canAgentEatSnakeFood(seeker, allyShard), false);
        assert.equal(canAgentEatSnakeFood(seeker, redShard), true);
        assert.equal(canAgentEatSnakeFood(seeker, blueShard), true);
        seeker.facing = Math.PI;
        primeSnakeHeadVision(state, seeker);
        assert.equal(findNearestVisibleSnakeFood(state, seeker).id, blueShard.id);
    });

    it("still treats neutral shards as edible for snakes", async () => {
        applySnakeGameConfig();
        const state = await createFoodQueryState();
        const config = getSnakeGameConfig();
        const chain = spawnLinkedBallChain(state, { col: 10, row: 8 }, chainOptions(config));
        const seeker = chain.head;
        seeker.faction = "red";
        const neutralShard = spawnSnakeFoodShardAtCell(state, { col: 6, row: 8 });
        assert.equal(canAgentEatSnakeFood(seeker, neutralShard), true);
    });
});
