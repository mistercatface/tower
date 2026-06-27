import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { SurfaceBakeCacheKeys, groundChunkWorkerDedupeKey } from "../Libraries/WorldSurface/SurfaceBakeCacheKeys.js";
import { SurfaceSpatialMap } from "../Libraries/WorldSurface/SurfaceSpatialMap.js";

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
        assert.equal(keys.groundChunkKey(0, 0, "test"), keys.groundChunkKey(4, 4, "test"));
        assert.notEqual(keys.staticRoofDrawKey(0, 0, "test", 1), keys.staticRoofDrawKey(4, 4, "test", 1));
    });

    it("uses wrapped source chunk ids for worker dedupe", () => {
        const base = { profileId: "test", seed: 7, zLevel: 0 };
        const a = groundChunkWorkerDedupeKey({ ...base, chunkCol: 0, chunkRow: 0, tileChunkCol: 0, tileChunkRow: 0 }, 0);
        const b = groundChunkWorkerDedupeKey({ ...base, chunkCol: 4, chunkRow: 4, tileChunkCol: 0, tileChunkRow: 0 }, 0);
        assert.equal(a, b);
    });

    it("wraps wall atlas samples to the same surface period", () => {
        const surfaceSpace = createSurfaceSpace();
        const atlas = surfaceSpace.wallAtlas({ x: 512, y: 0 }, { x: 528, y: 0 });
        assert.deepEqual(atlas.wrappedP1, { x: 0, y: 0 });
        assert.deepEqual(atlas.wrappedP2, { x: 16, y: 0 });
    });
});
