import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { resolveChunkSurfaceProfileId } from "../Libraries/Spatial/grid/SurfaceMaterialStore.js";
import { WorldSurfaceEngine } from "../Libraries/WorldSurface/WorldSurfaceEngine.js";

describe("chunk surface regions", () => {
    it("uses different ground and roof cache keys for different chunk profiles", () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        engine.activeSurfaceProfileId = "base";
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfile(0, 0, "north");
        grid.setChunkSurfaceProfile(0, 1, "south");
        const northProfile = resolveChunkSurfaceProfileId(grid, 0, 0, engine.activeSurfaceProfileId);
        const southProfile = resolveChunkSurfaceProfileId(grid, 0, 1, engine.activeSurfaceProfileId);
        assert.equal(northProfile, "north");
        assert.equal(southProfile, "south");
        const northGroundKey = engine.cacheKeys.groundChunkKey(0, 0, northProfile, 0);
        const southGroundKey = engine.cacheKeys.groundChunkKey(0, 1, southProfile, 0);
        assert.notEqual(northGroundKey, southGroundKey);
        const northRoofKey = engine.cacheKeys.staticRoofDrawKey(0, 0, northProfile, 1);
        const southRoofKey = engine.cacheKeys.staticRoofDrawKey(0, 1, southProfile, 1);
        assert.notEqual(northRoofKey, southRoofKey);
    });

    it("passes resolved chunk profile to ground chunk fetch and horizontal cap sampling", () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        engine.activeSurfaceProfileId = "base";
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfile(1, 0, "east");
        const state = { obstacleGrid: grid };
        const captured = [];
        const originalGetGround = engine.getGroundChunkCanvas.bind(engine);
        engine.getGroundChunkCanvas = (chunkCol, chunkRow, stateArg, zLevel, boundsSample, profileIdOverride) => {
            captured.push({ chunkCol, chunkRow, profileIdOverride, zLevel });
            return [{ isPlaceholder: true }];
        };
        engine._chunkDraw.state = state;
        engine._fillDrawableGroundChunkCanvas(1, 0, 0);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].profileIdOverride, "east");
        captured.length = 0;
        const corners = [
            { x: 72, y: 0 },
            { x: 88, y: 0 },
            { x: 88, y: 16 },
            { x: 72, y: 16 },
        ];
        const outSrc4 = corners.map((p) => ({ x: 0, y: 0 }));
        engine.fillHorizontalCapDrawSampleInto(corners, 1, state, outSrc4);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].profileIdOverride, "east");
        assert.equal(captured[0].zLevel, 1);
        engine.getGroundChunkCanvas = originalGetGround;
    });
});
