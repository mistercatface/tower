import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridSettings } from "../Config/world.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { generateSnakeSplitMap, resolveCenterSnakeSpawnAnchor, spawnSnakeCavernScene } from "../Libraries/Game/snake/snakeScene.js";
import { collectWalkableCells } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { createDefaultMapGenBoundsConfig, forEachGlobalCellInMapGenBounds } from "../Libraries/Sandbox/mapGenBounds.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { createNavGraphViewFromTopology } from "../Libraries/Navigation/navGraph.js";
import { cellInRect, colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { gameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
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
            railMazeConfig: createDefaultMapGenBoundsConfig(),
            eraseConfig: createDefaultMapGenBoundsConfig(),
        },
        kinetic: new KineticSession(),
        sandbox: new SandboxWorldState(),
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        worldSurfaces: { settings: gameWorldSurfaceSettings, invalidateGridBounds: () => {}, clearBakeCache: () => {} },
        nav: navigation,
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
    const graph = createNavGraphViewFromTopology(state.nav.topology);
    const visited = new Set();
    const cols = grid.cols;
    const rows = grid.rows;
    const startIdx = colRowToIndex(startCol, startRow, cols);
    if (grid.grid[startIdx] !== 0) return visited;
    
    const queue = [startIdx];
    visited.add(startIdx);
    
    while (queue.length) {
        const idx = queue.pop();
        const c = idx % cols;
        const r = (idx / cols) | 0;
        
        // West
        if (c > 0) {
            const nIdx = idx - 1;
            if (!visited.has(nIdx) && grid.grid[nIdx] === 0 && graph.canStepIdx(idx, nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
            }
        }
        // East
        if (c + 1 < cols) {
            const nIdx = idx + 1;
            if (!visited.has(nIdx) && grid.grid[nIdx] === 0 && graph.canStepIdx(idx, nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
            }
        }
        // North
        if (r > 0) {
            const nIdx = idx - cols;
            if (!visited.has(nIdx) && grid.grid[nIdx] === 0 && graph.canStepIdx(idx, nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
            }
        }
        // South
        if (r + 1 < rows) {
            const nIdx = idx + cols;
            if (!visited.has(nIdx) && grid.grid[nIdx] === 0 && graph.canStepIdx(idx, nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
            }
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
    it("keeps cavern floor open enough for snakes", { timeout: 15000 }, async () => {
        const samples = [11, 42, 99, 256, 1337, 9001];
        for (let i = 0; i < samples.length; i++) {
            const stats = await analyzeSnakeSplitMap(samples[i]);
            assert.ok(stats.cavern.ratio >= 0.28, `seed ${stats.mapSeed}: cavern open ratio ${stats.cavern.ratio.toFixed(3)}`);
            assert.ok(stats.openCavernCount >= 80, `seed ${stats.mapSeed}: only ${stats.openCavernCount} open cavern cells`);
        }
    });
    it("connects upper cavern to padding and lower rail zone on sampled seeds", { timeout: 15000 }, async () => {
        const samples = [11, 42, 99, 256, 1337, 9001];
        for (let i = 0; i < samples.length; i++) {
            const stats = await analyzeSnakeSplitMap(samples[i]);
            assert.ok(stats.padReach.ratio >= 0.5, `seed ${stats.mapSeed}: padding reach ${stats.padReach.ratio.toFixed(3)}`);
            assert.ok(stats.railReach.ratio >= 0.15, `seed ${stats.mapSeed}: rail reach ${stats.railReach.ratio.toFixed(3)}`);
        }
    });
    it("spawns the center-start snake at the nearest walkable cell to the map center", async () => {
        applySnakeGameConfig({ agentProfiles: { snake: { populationCount: 3 } } });
        const state = await createSnakeMapGenTestState(64, 42);
        const scene = await spawnSnakeCavernScene(state);
        const centerSnake = scene.snakes[0];
        const expectedAnchor = resolveCenterSnakeSpawnAnchor(state, scene.navWalkable, { segmentCount: centerSnake.chain.members.length });
        const headCell = state.obstacleGrid.worldToGrid(centerSnake.chain.head.x, centerSnake.chain.head.y);
        assert.equal(headCell.col, expectedAnchor.col);
        assert.equal(headCell.row, expectedAnchor.row);
    });
});
