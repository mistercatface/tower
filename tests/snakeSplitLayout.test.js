import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridSettings } from "../Config/world.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";
import { generateSnakeSplitMap } from "../Libraries/Game/snake/snakeScene.js";
import { bakeSnakeSplitLayoutPreview, centerPlayAreaBounds } from "../Libraries/Procedural/Mazes/snakeSplitLayout.js";
import { createDefaultMapGenBoundsConfig } from "../Libraries/Sandbox/mapGenBounds.js";
import { createWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { cellInRect } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { getGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { EntityRegistry } from "../GameState/EntityRegistry.js";
import { KineticSession } from "../GameState/KineticSession.js";
import { SandboxWorldState } from "../GameState/SandboxWorldState.js";
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
function gridSignature(grid, playableBounds) {
    const cellSize = grid.cellSize;
    const { boundsCol, boundsRow, boundsCols, boundsRows } = playableBounds;
    let voxels = 0;
    let edges = 0;
    for (let gr = boundsRow; gr < boundsRow + boundsRows; gr++)
        for (let gc = boundsCol; gc < boundsCol + boundsCols; gc++) {
            const { col, row } = grid.worldToGrid(gc * cellSize, gr * cellSize);
            if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
            if (grid.isBlocked(col, row)) voxels++;
            if (grid.edgeStore.hasAnyAtIdx(col + row * grid.cols)) edges++;
        }
    return { voxels, edges };
}
describe("snakeSplitLayout preview bake", () => {
    it("matches generateSnakeSplitMap voxel and edge counts on sampled seeds", async () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const seeds = [11, 42, 256];
        for (let i = 0; i < seeds.length; i++) {
            const mapSeed = seeds[i];
            const playAreaCells = 64;
            const state = await createSnakeMapGenTestState(playAreaCells, mapSeed);
            await generateSnakeSplitMap(state);
            const gameSig = gridSignature(state.obstacleGrid, state.sandbox.snakePlayableBounds);
            const preview = await bakeSnakeSplitLayoutPreview({
                mapSeed,
                playAreaCols: playAreaCells,
                playAreaRows: playAreaCells,
                playAreaBounds: centerPlayAreaBounds(playAreaCells, playAreaCells),
                cavern: config.cavern,
                rail: config.rail,
            });
            const labSig = gridSignature(preview.grid, preview.playableBounds);
            assert.equal(labSig.voxels, gameSig.voxels, `seed ${mapSeed} voxel mismatch`);
            assert.equal(labSig.edges, gameSig.edges, `seed ${mapSeed} edge mismatch`);
        }
    });
    it("bakes 256×256 under a few seconds", async () => {
        applySnakeGameConfig();
        const config = getSnakeGameConfig();
        const started = performance.now();
        const preview = await bakeSnakeSplitLayoutPreview({ mapSeed: 42, playAreaCols: 256, playAreaRows: 256, cavern: config.cavern, rail: config.rail });
        const elapsed = performance.now() - started;
        assert.ok(preview.walkableIndices.size > 1000);
        assert.ok(elapsed < 4000, `256 bake took ${elapsed.toFixed(0)} ms`);
    });
});
