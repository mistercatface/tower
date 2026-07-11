import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { acquireOffscreenCanvas } from "../Libraries/Canvas/canvas.js";
import { createTestSpriteCacheSlab } from "./harness/spriteCacheSlabHarness.js";
import { WorldSurfaceEngine } from "../Libraries/WorldSurface/worldSurface.js";
import { TileWorkerCoordinator } from "../Libraries/WorldSurface/worldSurface.js";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";
import { createSurfaceBakeTestState } from "./harness/stateFactories.js";

const EMPTY_META = {};

describe("SpriteCacheSlab Leak Auditing", () => {
    let createdBitmaps = [];
    let closedBitmaps = 0;

    before(() => {
        globalThis.createImageBitmap = async (source) => {
            const bmp = new ImageBitmap(source.width ?? 0, source.height ?? 0);
            bmp.close = () => {
                closedBitmaps++;
            };
            createdBitmaps.push(bmp);
            return bmp;
        };
    });

    it("releases offscreen canvas and closes image bitmap on overwrite", async () => {
        const cache = createTestSpriteCacheSlab(10);
        createdBitmaps = [];
        closedBitmaps = 0;

        const canvas1 = acquireOffscreenCanvas(987, 654);
        cache.set("item1", canvas1, EMPTY_META);

        const canvas2 = acquireOffscreenCanvas(987, 654);
        cache.set("item1", canvas2, EMPTY_META);

        await new Promise((resolve) => setTimeout(resolve, 50));

        const canvasRecycled = acquireOffscreenCanvas(987, 654);
        const canvasRecycled2 = acquireOffscreenCanvas(987, 654);
        assert.ok(
            (canvasRecycled === canvas1 && canvasRecycled2 === canvas2) ||
                (canvasRecycled === canvas2 && canvasRecycled2 === canvas1),
            "The overwritten OffscreenCanvas should be released back to the pool"
        );

        assert.equal(createdBitmaps.length, 2, "Should have created two ImageBitmaps");
        assert.equal(closedBitmaps, 1, "Should have closed the ImageBitmap for the overwritten entry");
    });

    it("handles async promotion race where entry is evicted before promise resolves", async () => {
        const cache = createTestSpriteCacheSlab(1);
        createdBitmaps = [];
        closedBitmaps = 0;

        const canvas1 = acquireOffscreenCanvas(876, 543);
        cache.set("item1", canvas1, EMPTY_META);

        const canvas2 = acquireOffscreenCanvas(876, 543);
        cache.set("item2", canvas2, EMPTY_META);

        await new Promise((resolve) => setTimeout(resolve, 50));

        const canvasRecycled = acquireOffscreenCanvas(876, 543);
        const canvasRecycled2 = acquireOffscreenCanvas(876, 543);
        assert.ok(
            (canvasRecycled === canvas1 && canvasRecycled2 === canvas2) ||
                (canvasRecycled === canvas2 && canvasRecycled2 === canvas1),
            "The evicted OffscreenCanvas should be released back to the pool"
        );

        assert.equal(closedBitmaps, 1, "The ImageBitmap of the evicted entry should be closed");
    });
});

describe("WorldSurfaceEngine Leak Auditing", () => {
    it("closes bitmaps when surface bake returns invalid/non-drawable bitmaps", async () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);

        let closedBitmapsCount = 0;
        const mockBitmap = {
            width: 0,
            height: 16,
            close() {
                closedBitmapsCount++;
            },
        };

        const originalRequest = TileWorkerCoordinator.requestGroundChunkBake;
        TileWorkerCoordinator.requestGroundChunkBake = async () => {
            return [mockBitmap];
        };

        try {
            const mockState = createSurfaceBakeTestState();

            engine.getGroundChunkCanvas(packChunkKey(0, 0), mockState, 0, null, "test_profile");

            await new Promise((resolve) => setTimeout(resolve, 50));

            assert.equal(closedBitmapsCount, 1, "The invalid ImageBitmap should have been closed to prevent leakage");
        } finally {
            TileWorkerCoordinator.requestGroundChunkBake = originalRequest;
        }
    });
});
