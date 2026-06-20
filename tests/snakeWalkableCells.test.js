import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createDefaultMapGenBoundsConfig, forEachGlobalCellInMapGenBounds } from "../Libraries/Sandbox/mapGenBounds.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { generateSnakeSplitMap, spawnSnakeCavernScene } from "../Libraries/Game/snake/snakeScene.js";
import { wireSnakeGameRegistry, createSnakeLifecycleRegistry } from "../Libraries/Game/snake/snakeLifecycle.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { isNavWalkableCell } from "../Libraries/Spatial/grid/navWalkableCell.js";
import { walkableCellKey } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { gridSettings } from "../Config/world.js";
import { createSnakeNavWalkable } from "./harness/snakeGameHarness.js";
loadPropAssets();
async function createSnakeWalkableTestState(playAreaCells = 32, mapSeed = 42) {
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
describe("snake navWalkable session", () => {
    it("spawnSnakeCavernScene returns navWalkable bound to playable bounds", async () => {
        applySnakeGameConfig({ snakeCount: 2, goalCount: 3 });
        const state = await createSnakeWalkableTestState(48, 1337);
        const scene = await spawnSnakeCavernScene(state);
        assert.ok(scene.navWalkable);
        assert.ok(scene.navWalkable.cells().length >= 80);
    });
    it("wired navWalkable serves explore picks after wireSnakeGameRegistry", async () => {
        applySnakeGameConfig({ snakeCount: 2, goalCount: 3 });
        const state = await createSnakeWalkableTestState(48, 1337);
        const scene = await spawnSnakeCavernScene(state);
        wireSnakeGameRegistry(state, createSnakeLifecycleRegistry(), new Map(), scene.navWalkable);
        const picked = state.sandbox.snakeGame.navWalkable.pick({ rng: () => 0 });
        assert.ok(picked);
        assert.ok(state.sandbox.snakeGame.navWalkable.has(picked.col, picked.row));
    });
    it("wired navWalkable cells on split map are nav-walkable", async () => {
        applySnakeGameConfig();
        const state = await createSnakeWalkableTestState(48, 1337);
        await generateSnakeSplitMap(state);
        wireSnakeGameRegistry(state, createSnakeLifecycleRegistry(), new Map(), createSnakeNavWalkable(state));
        const cells = state.sandbox.snakeGame.navWalkable.cells();
        assert.ok(cells.length >= 80);
        const grid = state.obstacleGrid;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            assert.ok(isNavWalkableCell(grid, state.navigation.gridNavContext, cell.col, cell.row), `cell ${walkableCellKey(cell.col, cell.row)} not nav-walkable`);
        }
    });
    it("baked navWalkable drops disconnected cells on the split map", async () => {
        applySnakeGameConfig({ snakeCount: 1 });
        const state = await createSnakeWalkableTestState(48, 42);
        const scene = await spawnSnakeCavernScene(state);
        const player = scene.snakes[0];
        const headCell = state.obstacleGrid.worldToGrid(player.chain.head.x, player.chain.head.y);
        assert.ok(scene.navWalkable.has(headCell.col, headCell.row));
        let localPassCount = 0;
        const playable = state.sandbox.snakePlayableBounds;
        const grid = state.obstacleGrid;
        const cellSize = grid.cellSize;
        forEachGlobalCellInMapGenBounds(playable, (globalCol, globalRow) => {
            const { col, row } = grid.worldToGrid(globalCol * cellSize, globalRow * cellSize);
            if (isNavWalkableCell(grid, state.navigation.gridNavContext, col, row)) localPassCount++;
        });
        assert.ok(scene.navWalkable.cells().length < localPassCount);
    });
});
