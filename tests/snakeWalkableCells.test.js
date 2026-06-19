import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { applySnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { generateSnakeSplitMap } from "../Libraries/Game/snake/snakeScene.js";
import {
    bakeSnakeWalkableCells,
    getSnakeWalkableCells,
    isSnakeNavWalkableCell,
    isSnakeWalkableCell,
    pickSnakeWalkableCell,
} from "../Libraries/Game/snake/snakeWalkableCells.js";
import { walkableCellKey } from "../Libraries/Procedural/Mazes/walkableCells.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { gridSettings } from "../Config/world.js";

loadPropAssets();

function createSnakeWalkableTestState(playAreaCells = 32, mapSeed = 42) {
    const cellSize = gridSettings.cellSize;
    const grid = new WorldObstacleGrid(cellSize);
    grid.rebuildFixed(0, 0, playAreaCells * cellSize, playAreaCells * cellSize);
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
        sandbox: new SandboxWorldState(),
        entityRegistry: new EntityRegistry(),
        worldProps: [],
        worldSurfaces: { settings: getGameWorldSurfaceSettings(), invalidateGridBounds: () => {}, clearBakeCache: () => {} },
        navigation: { onObstaclesChanged: async () => {}, obstacleGeneration: 0 },
    };
}

describe("snakeWalkableCells", () => {
    it("excludes blocked voxels from the baked snake walkable list", () => {
        applySnakeGameConfig();
        const state = createSnakeWalkableTestState(16);
        state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: 0, boundsRow: 0, boundsCols: 16, boundsRows: 16 };
        const grid = state.obstacleGrid;
        grid.grid[colRowToIndex(4, 4, grid.cols)] = 1;
        bakeSnakeWalkableCells(state);
        assert.ok(!isSnakeWalkableCell(state, 4, 4));
        assert.ok(getSnakeWalkableCells(state).every((cell) => !(cell.col === 4 && cell.row === 4)));
    });

    it("rebakes when navigation epoch changes", () => {
        applySnakeGameConfig();
        const state = createSnakeWalkableTestState(16);
        state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: 0, boundsRow: 0, boundsCols: 16, boundsRows: 16 };
        bakeSnakeWalkableCells(state);
        const before = getSnakeWalkableCells(state).length;
        state.navigation.obstacleGeneration = 1;
        state.obstacleGrid.grid[colRowToIndex(2, 2, state.obstacleGrid.cols)] = 1;
        bakeSnakeWalkableCells(state);
        const after = getSnakeWalkableCells(state).length;
        assert.ok(after <= before);
        assert.ok(!isSnakeWalkableCell(state, 2, 2));
    });

    it("pickSnakeWalkableCell only returns baked nav-walkable cells", () => {
        applySnakeGameConfig();
        const state = createSnakeWalkableTestState(16);
        state.sandbox.snakePlayableBounds = { boundsMode: "rect", boundsCol: 0, boundsRow: 0, boundsCols: 16, boundsRows: 16 };
        bakeSnakeWalkableCells(state);
        const picked = pickSnakeWalkableCell(state, { rng: () => 0 });
        assert.ok(picked);
        assert.ok(isSnakeWalkableCell(state, picked.col, picked.row));
        assert.ok(isSnakeNavWalkableCell(state.obstacleGrid, picked.col, picked.row));
    });

    it("baked cells on generated snake split map are nav-walkable", async () => {
        applySnakeGameConfig();
        const state = createSnakeWalkableTestState(48, 1337);
        await generateSnakeSplitMap(state);
        bakeSnakeWalkableCells(state);
        const cells = getSnakeWalkableCells(state);
        assert.ok(cells.length >= 80);
        const grid = state.obstacleGrid;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            assert.ok(isSnakeNavWalkableCell(grid, cell.col, cell.row), `cell ${walkableCellKey(cell.col, cell.row)} not nav-walkable`);
        }
    });
});
