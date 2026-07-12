import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { resolveSurfaceProfileId, SURFACE_MATERIAL_OWNER, packChunkKey, cellIdxToChunkKey } from "../Libraries/Spatial/spatial.js";
import { WorldSurfaceEngine } from "../Libraries/WorldSurface/worldSurface.js";
import { setChunkSurfaceProfileEdit } from "../Libraries/Spatial/spatial.js";

describe("chunk surface regions", () => {
    it("uses different ground and roof cache keys for different chunk profiles", () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        engine.activeSurfaceProfileId = "base";
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "north");
        grid.setChunkSurfaceProfileAtKey(packChunkKey(0, 1), "south");
        const northProfile = resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, engine.activeSurfaceProfileId, 0, packChunkKey(0, 0));
        const southProfile = resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, engine.activeSurfaceProfileId, 0, packChunkKey(0, 1));
        assert.equal(northProfile, "north");
        assert.equal(southProfile, "south");
        const northGroundKey = engine.cacheKeys.groundChunkKey(packChunkKey(0, 0), northProfile, 0);
        const southGroundKey = engine.cacheKeys.groundChunkKey(packChunkKey(0, 1), southProfile, 0);
        assert.notEqual(northGroundKey, southGroundKey);
        const northRoofKey = engine.cacheKeys.staticRoofDrawKey(packChunkKey(0, 0), northProfile, 1);
        const southRoofKey = engine.cacheKeys.staticRoofDrawKey(packChunkKey(0, 1), southProfile, 1);
        assert.notEqual(northRoofKey, southRoofKey);
    });

    it("passes resolved chunk profile to ground chunk fetch and horizontal cap sampling", () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        engine.activeSurfaceProfileId = "base";
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfileAtKey(packChunkKey(1, 0), "east");
        const state = { obstacleGrid: grid };
        const captured = [];
        const originalGetGround = engine.getGroundChunkCanvas.bind(engine);
        engine.getGroundChunkCanvas = (chunkKey, stateArg, zLevel, boundsSample, profileIdOverride) => {
            captured.push({ chunkKey, profileIdOverride, zLevel });
            return [{ isPlaceholder: true }];
        };
        engine._chunkDraw.state = state;
        engine._fillDrawableGroundChunkCanvas(packChunkKey(1, 0), 0);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].profileIdOverride, "east");
        captured.length = 0;
        const corners8 = new Float32Array([
            72, 0,
            88, 0,
            88, 16,
            72, 16
        ]);
        const outSrc8 = new Float32Array(8);
        engine.fillHorizontalCapDrawSampleIntoFlat(corners8, 1, state, outSrc8);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].profileIdOverride, "east");
        assert.equal(captured[0].zLevel, 1);
        engine.getGroundChunkCanvas = originalGetGround;
    });

    it("invalidates affected cell bounds when chunk profiles change through the edit helper", () => {
        const settings = createGameWorldSurfaceSettings();
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        let invalidated = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                settings,
                invalidateGridBounds(idx, stateArg) {
                    invalidated = { idx, stateArg };
                },
            },
        };
        const bounds = setChunkSurfaceProfileEdit(state, { startCol: 8, endCol: 15, startRow: 0, endRow: 15 }, "east");
        assert.deepEqual(bounds, { startCol: 8, endCol: 15, startRow: 0, endRow: 15 });
        assert.equal(invalidated.idx, null);
        assert.equal(invalidated.stateArg, grid);
        assert.equal(resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, "base", 0, packChunkKey(1, 1)), "east");
    });

    it("invalidateGridBounds accepts null, cell index, and CellBounds; rejects bad shapes", () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        engine.activeSurfaceProfileId = "base";
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        grid.grid[4 + 4 * grid.cols] = 1;
        grid.grid[12 + 12 * grid.cols] = 1;
        const zLevels = grid.collectStaticStructureZLevels();
        assert.ok(zLevels.length > 0);
        const zLevel = zLevels[0];
        const idxA = 4 + 4 * grid.cols;
        const idxB = 12 + 12 * grid.cols;
        const chunkA = cellIdxToChunkKey(idxA, grid, settings.cellsPerChunk);
        const chunkB = cellIdxToChunkKey(idxB, grid, settings.cellsPerChunk);
        assert.notEqual(chunkA, chunkB);
        const maskA = engine.cacheKeys.staticRoofMaskKey(chunkA, zLevel);
        const maskB = engine.cacheKeys.staticRoofMaskKey(chunkB, zLevel);
        const drawA = engine.cacheKeys.staticRoofDrawKey(chunkA, "base", zLevel);
        engine.surfaceCache.set(maskA, { seeded: true });
        engine.surfaceCache.set(maskB, { seeded: true });
        engine.surfaceCache.set(drawA, { seeded: true });

        engine.invalidateGridBounds(idxA, grid);
        assert.equal(engine.surfaceCache.get(maskA), null);
        assert.equal(engine.surfaceCache.get(drawA), null);
        assert.ok(engine.surfaceCache.get(maskB));

        engine.surfaceCache.set(maskA, { seeded: true });
        engine.invalidateGridBounds({ startCol: 0, endCol: 7, startRow: 0, endRow: 7 }, grid);
        assert.equal(engine.surfaceCache.get(maskA), null);
        assert.ok(engine.surfaceCache.get(maskB));

        engine.surfaceCache.set(maskA, { seeded: true });
        engine.surfaceCache.set(maskB, { seeded: true });
        engine.invalidateGridBounds(null, grid);
        assert.equal(engine.surfaceCache.get(maskA), null);
        assert.equal(engine.surfaceCache.get(maskB), null);

        assert.throws(() => engine.invalidateGridBounds({ foo: 1 }, grid), /region must be null/);
    });
});
