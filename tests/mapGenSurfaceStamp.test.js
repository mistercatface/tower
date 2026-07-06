import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    WorldObstacleGrid,
    createDefaultMapGenBoundsConfig,
    applyPlayAreaConfig,
    generateLabRailMaze,
    centerMapGenBoundsOnViewport,
    hasMapGenStamp,
    packChunkKey,
    cellToChunkCoord,
} from "../Libraries/Spatial/spatial.js";
import { createLabMapBoundsPreview } from "../Apps/Editor/TileLabEditorState.js";
import { createNavRuntime } from "./WorkerNavigationFactory.js";

const CELLS_PER_CHUNK = 16;

function chunkProfileAtCell(grid, col, row) {
    const key = packChunkKey(cellToChunkCoord(col, CELLS_PER_CHUNK), cellToChunkCoord(row, CELLS_PER_CHUNK));
    return grid.surfaceMaterials.getChunkAtKey(key);
}

function createMapGenTestState() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(128, 128, 512, 512);
    return {
        obstacleGrid: grid,
        viewport: { x: 128, y: 128 },
        editor: {
            playConfig: { playAreaCols: 128, playAreaRows: 128 },
            mapBoundsPreview: createLabMapBoundsPreview(),
            cavernConfig: { ...createDefaultMapGenBoundsConfig(), surfaceProfileId: "tomatoGarden" },
            railConfig: { ...createDefaultMapGenBoundsConfig(), surfaceProfileId: "poolTableFelt" },
            railMazeConfig: {
                ...createDefaultMapGenBoundsConfig(),
                wallHeightLevel: 1,
                edgeThickness: 1,
                corridorWidthMin: 1,
                corridorWidthMax: 2,
                extraLinkRatio: 0.25,
                surfaceProfileId: "cyberGrid",
            },
            eraseConfig: createDefaultMapGenBoundsConfig(),
        },
        worldSurfaces: { settings: { cellsPerChunk: CELLS_PER_CHUNK, maxWallHeightLevel: 8 }, clearBakeCache() {}, invalidateGridBounds() {} },
        nav: createNavRuntime(grid),
        mapSeed: 42,
    };
}

describe("mapGenSurfaceStamp", () => {
    it("applyPlayAreaConfig does not paint surfaces before generation", async () => {
        const state = createMapGenTestState();
        await applyPlayAreaConfig(state);
        const grid = state.obstacleGrid;
        const railBoundsIdx = state.editor.railConfig.boundsIdx;
        const col = railBoundsIdx % grid.cols;
        const row = (railBoundsIdx / grid.cols) | 0;
        assert.equal(chunkProfileAtCell(grid, col, row), null);
        assert.equal(hasMapGenStamp(state.editor.railConfig), false);
    });

    it("generateLabRailMaze paints only the stamped 64x64 footprint", async () => {
        const state = createMapGenTestState();
        const railMazeConfig = state.editor.railMazeConfig;
        railMazeConfig.boundsMode = "rect";
        railMazeConfig.boundsCols = 64;
        railMazeConfig.boundsRows = 64;
        railMazeConfig.surfaceProfileId = "poolTableFelt";
        centerMapGenBoundsOnViewport(state.obstacleGrid, { x: 0, y: 0 }, railMazeConfig);
        await generateLabRailMaze(state);
        const grid = state.obstacleGrid;
        assert.ok(hasMapGenStamp(railMazeConfig));
        const stampCol = railMazeConfig.stampedBoundsIdx % grid.cols;
        const stampRow = (railMazeConfig.stampedBoundsIdx / grid.cols) | 0;
        assert.equal(chunkProfileAtCell(grid, stampCol, stampRow), "poolTableFelt");
        const outsideCol = stampCol + railMazeConfig.stampedBoundsCols + 4;
        const outsideRow = stampRow + railMazeConfig.stampedBoundsRows + 4;
        if (outsideCol < grid.cols && outsideRow < grid.rows) {
            assert.equal(chunkProfileAtCell(grid, outsideCol, outsideRow), null);
        }
    });
});
