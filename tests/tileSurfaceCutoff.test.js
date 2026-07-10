import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { SurfaceBakeCacheKeys, groundChunkWorkerDedupeKey, WorldSurfaceEngine, TileWorkerCoordinator } from "../Libraries/WorldSurface/worldSurface.js";
import { SurfaceSpatialMap } from "../Libraries/WorldSurface/worldSurface.js";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";
import { createSurfaceBakeTestState } from "./harness/stateFactories.js";

function createSurfaceSpace(overrides = {}) {
    return new SurfaceSpatialMap(createGameWorldSurfaceSettings(overrides));
}

describe("surface tile cutoff", () => {
    it("validates that the tile period divides into chunk cells", () => {
        assert.throws(() => createGameWorldSurfaceSettings({ surfaceTilePeriodCells: 30 }), /surfaceTilePeriodCells/);
    });

    it("wraps ground source chunks inside the surface tile period", () => {
        const surfaceSpace = createSurfaceSpace();
        const keys = new SurfaceBakeCacheKeys(surfaceSpace);
        assert.equal(surfaceSpace.surfaceTileChunks(), 4);
        assert.equal(keys.groundChunkKey(packChunkKey(0, 0), "test"), keys.groundChunkKey(packChunkKey(4, 4), "test"));
        assert.equal(keys.groundChunkKey(packChunkKey(0, 0), "test", 1), keys.groundChunkKey(packChunkKey(4, 4), "test", 1));
    });

    it("keeps roof mask and composite keys per real chunk (real geometry, not wrapped)", () => {
        const surfaceSpace = createSurfaceSpace();
        const keys = new SurfaceBakeCacheKeys(surfaceSpace);
        assert.notEqual(keys.staticRoofMaskKey(packChunkKey(0, 0), 1), keys.staticRoofMaskKey(packChunkKey(4, 4), 1));
        assert.notEqual(keys.staticRoofDrawKey(packChunkKey(0, 0), "test", 1), keys.staticRoofDrawKey(packChunkKey(4, 4), "test", 1));
    });

    it("uses wrapped source chunk ids for worker dedupe", () => {
        const base = { profileId: "test", seed: 7, zLevel: 0 };
        const a = groundChunkWorkerDedupeKey({ ...base, chunkKey: packChunkKey(0, 0), tileChunkKey: packChunkKey(0, 0) }, 0);
        const b = groundChunkWorkerDedupeKey({ ...base, chunkKey: packChunkKey(4, 4), tileChunkKey: packChunkKey(0, 0) }, 0);
        assert.equal(a, b);
    });

    it("wraps wall atlas samples to the same surface period", () => {
        const surfaceSpace = createSurfaceSpace();
        const atlas = surfaceSpace.wallAtlas({ x: 512, y: 0 }, { x: 528, y: 0 });
        assert.deepEqual(atlas.wrappedP1, { x: 0, y: 0 });
        assert.deepEqual(atlas.wrappedP2, { x: 16, y: 0 });
    });
});

describe("world surface retry and cooldown", () => {
    it("handles worker bake failure, sets cooldown, and retries after expiration", async () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);
        const mockState = createSurfaceBakeTestState();
        
        let shouldFail = true;
        let callCount = 0;
        
        // Mock the TileWorkerCoordinator calls
        const originalRequest = TileWorkerCoordinator.requestGroundChunkBake;
        TileWorkerCoordinator.requestGroundChunkBake = async (payload) => {
            callCount++;
            if (shouldFail) {
                throw new Error("Simulated worker timeout");
            }
            return [new class FakeImageBitmap {
                width = 16;
                height = 16;
                close() {}
            }];
        };
        
        try {
            // First attempt: should fail and set cooldown
            const result1 = engine.getGroundChunkCanvas(packChunkKey(0, 0), mockState, 0, null, "test_profile");
            assert.ok(result1[0].isPlaceholder, "Should initially return a placeholder");
            
            // Wait for promise microtasks to resolve the failure
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Check that placeholder is evicted (should return null if on cooldown)
            const result2 = engine.getGroundChunkCanvas(packChunkKey(0, 0), mockState, 0, null, "test_profile");
            assert.equal(result2, null, "Should return null when on cooldown");
            
            // Fast-forward or force cooldown expiration
            const key = engine.cacheKeys.groundChunkKey(packChunkKey(0, 0), "test_profile", 0);
            engine.bakeCooldowns.set(key, 0); // Expired cooldown
            
            // Try again: should re-attempt bake (callCount increments)
            shouldFail = false;
            const result3 = engine.getGroundChunkCanvas(packChunkKey(0, 0), mockState, 0, null, "test_profile");
            assert.ok(result3[0].isPlaceholder, "Should return placeholder again on retry");
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Verify bake resolved successfully and no longer has placeholder
            const finalCanvas = engine.surfaceCache.get(key);
            assert.ok(finalCanvas && !finalCanvas[0].isPlaceholder, "Should now be the resolved canvas");
            assert.equal(callCount, 2, "Should have called bake function exactly twice");
        } finally {
            TileWorkerCoordinator.requestGroundChunkBake = originalRequest;
        }
    });
});
