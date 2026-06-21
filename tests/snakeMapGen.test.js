import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { gridSettings } from "../Config/world.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { collectSnakeGoalProps } from "../Libraries/Game/snake/snakeGoals.js";
import { generateSnakeSplitMap, resolveCenterSnakeSpawnAnchor, spawnSnakeCavernScene } from "../Libraries/Game/snake/snakeScene.js";
import { collectWalkableCells } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { createDefaultMapGenBoundsConfig, forEachGlobalCellInMapGenBounds } from "../Libraries/Sandbox/mapGenBounds.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { createNavGraphViewFromContext } from "../Libraries/Navigation/navGraph.js";
import { cellInRect, colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
loadPropAssets();
async function createSnakeMapGenTestState(playAreaCells, mapSeed) {
    const cellSize = gridSettings.cellSize;
    const grid = new WorldObstacleGrid(cellSize);
    grid.rebuildFixed(0, 0, playAreaCells * cellSize, playAreaCells * cellSize);
    const navigation = await createWorkerNavigation(grid);
    return {
        mapSeed,
        obstacleGrid: grid,
        viewport: { x: (playAreaCells * cellSize) / 2, y: (playAreaCells * cellSize) / 2, snapTo() {} },
        editor: {
            playConfig: { playAreaCols: playAreaCells, playAreaRows: playAreaCells },
            cavernConfig: { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9 },
            railConfig: { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9, edgeThickness: 2 },
            eraseConfig: createDefaultMapGenBoundsConfig(),
        },
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {}, clearBakeCache: () => {} },
        navigation,
        hpaPathWorker: navigation._hpaPathWorker,
    };
}
function countWalkableInBounds(state, config) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    let total = 0;
    let open = 0;
    forEachGlobalCellInMapGenBounds(config, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        total++;
        if (!grid.isBlocked(col, row)) open++;
    });
    return { total, open, ratio: total ? open / total : 0 };
}
function paddingBounds(state) {
    const { cavernConfig, railConfig, playConfig } = state.editor;
    const padding = getSnakeGameConfig().cavern.regionPaddingCells ?? 4;
    const innerRows = Math.max(2, playConfig.playAreaRows - padding);
    const topRows = Math.floor(innerRows / 2);
    return { boundsMode: "rect", boundsCol: cavernConfig.boundsCol, boundsRow: cavernConfig.boundsRow + topRows, boundsCols: cavernConfig.boundsCols, boundsRows: padding };
}
function floodFillWalkable(state, startCol, startRow) {
    const grid = state.obstacleGrid;
    const graph = createNavGraphViewFromContext(state.navigation.gridNavContext);
    const visited = new Set();
    const queue = [{ col: startCol, row: startRow }];
    const cardinals = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    while (queue.length) {
        const { col, row } = queue.pop();
        const key = colRowToIndex(col, row, grid.cols);
        if (visited.has(key)) continue;
        if (!cellInRect(col, row, grid.cols, grid.rows) || grid.isBlocked(col, row)) continue;
        visited.add(key);
        for (let i = 0; i < cardinals.length; i++) {
            const nc = col + cardinals[i][0];
            const nr = row + cardinals[i][1];
            if (!graph.canStep(col, row, nc, nr)) continue;
            queue.push({ col: nc, row: nr });
        }
    }
    return visited;
}
function countVisitedInBounds(visited, state, config) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    let total = 0;
    let reached = 0;
    forEachGlobalCellInMapGenBounds(config, (globalCol, globalRow) => {
        const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
        if (!cellInRect(col, row, grid.cols, grid.rows)) return;
        total++;
        if (visited.has(colRowToIndex(col, row, grid.cols))) reached++;
    });
    return { total, reached, ratio: total ? reached / total : 0 };
}
function pickCavernSouthOpenCell(state, openCavernCells) {
    const { cavernConfig } = state.editor;
    const southGlobalRow = cavernConfig.boundsRow + cavernConfig.boundsRows - 1;
    const cellSize = state.obstacleGrid.cellSize;
    for (let i = 0; i < openCavernCells.length; i++) {
        const cell = openCavernCells[i];
        const { y } = state.obstacleGrid.gridToWorld(cell.col, cell.row);
        if (Math.round(y / cellSize) === southGlobalRow) return cell;
    }
    return openCavernCells[0] ?? null;
}
async function analyzeSnakeSplitMap(mapSeed, playAreaCells = 64) {
    applySnakeGameConfig();
    const state = await createSnakeMapGenTestState(playAreaCells, mapSeed);
    await generateSnakeSplitMap(state);
    const { cavernConfig, railConfig } = state.editor;
    const cavern = countWalkableInBounds(state, cavernConfig);
    const rail = countWalkableInBounds(state, railConfig);
    const padConfig = paddingBounds(state);
    const padding = countWalkableInBounds(state, padConfig);
    const openCavernCells = collectWalkableCells(state);
    const start = pickCavernSouthOpenCell(state, openCavernCells);
    const visited = start ? floodFillWalkable(state, start.col, start.row) : new Set();
    const padReach = countVisitedInBounds(visited, state, padConfig);
    const railReach = countVisitedInBounds(visited, state, railConfig);
    return { mapSeed, cavern, rail, padding, padReach, railReach, openCavernCount: openCavernCells.length };
}
describe("snake split map generation", () => {
    it("keeps cavern floor open enough for snakes and goals", async () => {
        const samples = [11, 42, 99, 256, 1337, 9001];
        for (let i = 0; i < samples.length; i++) {
            const stats = await analyzeSnakeSplitMap(samples[i]);
            assert.ok(stats.cavern.ratio >= 0.28, `seed ${stats.mapSeed}: cavern open ratio ${stats.cavern.ratio.toFixed(3)}`);
            assert.ok(stats.openCavernCount >= 80, `seed ${stats.mapSeed}: only ${stats.openCavernCount} open cavern cells`);
        }
    });
    it("connects upper cavern to padding and lower rail zone on sampled seeds", async () => {
        const samples = [11, 42, 99, 256, 1337, 9001];
        for (let i = 0; i < samples.length; i++) {
            const stats = await analyzeSnakeSplitMap(samples[i]);
            assert.ok(stats.padReach.ratio >= 0.5, `seed ${stats.mapSeed}: padding reach ${stats.padReach.ratio.toFixed(3)}`);
            assert.ok(stats.railReach.ratio >= 0.15, `seed ${stats.mapSeed}: rail reach ${stats.railReach.ratio.toFixed(3)}`);
        }
    });
    it("spawns the center-start snake at the nearest walkable cell to the map center", async () => {
        applySnakeGameConfig({ snakeCount: 3 });
        const state = await createSnakeMapGenTestState(64, 42);
        const scene = await spawnSnakeCavernScene(state);
        const centerSnake = scene.snakes[0];
        const expectedAnchor = resolveCenterSnakeSpawnAnchor(state, scene.navWalkable, { segmentCount: getSnakeGameConfig().segmentCount });
        const headCell = state.obstacleGrid.worldToGrid(centerSnake.chain.head.x, centerSnake.chain.head.y);
        assert.equal(headCell.col, expectedAnchor.col);
        assert.equal(headCell.row, expectedAnchor.row);
    });
    it("places food in the lower rail maze, not only the upper cavern", async () => {
        applySnakeGameConfig({ snakeCount: 1, goalCount: 40 });
        const state = await createSnakeMapGenTestState(64, 42);
        await spawnSnakeCavernScene(state);
        const { railConfig } = state.editor;
        const railRow0 = railConfig.boundsRow;
        const railRow1 = railConfig.boundsRow + railConfig.boundsRows - 1;
        let inRail = 0;
        for (const goal of collectSnakeGoalProps(state)) {
            const { row } = state.obstacleGrid.worldToGrid(goal.x, goal.y);
            if (row >= railRow0 && row <= railRow1) inRail++;
        }
        assert.ok(inRail >= 5, `expected food in rail zone, got ${inRail} of 40 goals`);
    });
});
