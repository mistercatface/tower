import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { countLiveSnakeFood, canAgentEatSnakeFood, findNearestVisibleSnakeFood } from "../Libraries/Game/snake/snakeFood.js";
import { wireSnakeTestGame, wireSnakeTestNavSession, primeSnakeHeadVision, spawnSnakeFoodShardAtCell } from "./harness/snakeGameHarness.js";
import { spawnLinkedBallChain } from "../Libraries/Sandbox/spawnLinkedBallChain.js";
import { applySnakeGameConfig, getSnakeGameConfig, resolveSnakeSegmentSpacing } from "../Libraries/Game/snake/snakeGameConfig.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { removeSandboxWorldProp } from "../Libraries/Sandbox/sandboxPlacedSpawn.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { markSnakeSegmentsFracturable } from "../Libraries/Game/snake/snakeSegmentFracture.js";

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
    it("matches 360 range and LOS visibility through the dynamic food query", async () => {
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
