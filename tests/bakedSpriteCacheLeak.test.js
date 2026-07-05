import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { createBakedSpriteCache } from "../Libraries/Canvas/canvas.js";
import { acquireOffscreenCanvas } from "../Libraries/Canvas/canvas.js";
import { WorldSurfaceEngine } from "../Libraries/WorldSurface/worldSurface.js";
import { TileWorkerCoordinator } from "../Libraries/WorldSurface/worldSurface.js";
import { createGameWorldSurfaceSettings } from "../Render/WorldSurfaceBootstrap.js";

// Ensure global ImageBitmap shim exists for environment
if (typeof globalThis.ImageBitmap === "undefined") {
    globalThis.ImageBitmap = class ImageBitmap { close() {} };
}

describe("BakedSpriteCache Leak Auditing", () => {
    let createdBitmaps = [];
    let closedBitmaps = 0;

    before(() => {
        globalThis.createImageBitmap = async (source) => {
            const bmp = {
                width: source.width ?? 0,
                height: source.height ?? 0,
                close() {
                    closedBitmaps++;
                },
            };
            createdBitmaps.push(bmp);
            return bmp;
        };
    });

    it("releases offscreen canvas and closes image bitmap on overwrite", async () => {
        const cache = createBakedSpriteCache({ maxItems: 10 });
        createdBitmaps = [];
        closedBitmaps = 0;

        // Acquire canvas with unique dimensions to trace pool release
        const canvas1 = acquireOffscreenCanvas(987, 654);
        cache.set("item1", canvas1);

        // Overwrite the entry with a new canvas immediately
        const canvas2 = acquireOffscreenCanvas(987, 654);
        cache.set("item1", canvas2);

        // Wait for all async promotions to settle
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify that canvas1 was released back to the pool
        const canvasRecycled = acquireOffscreenCanvas(987, 654);
        assert.equal(canvasRecycled, canvas1, "The overwritten OffscreenCanvas should be released back to the pool");

        // Verify that any created ImageBitmaps for discarded entries are closed
        assert.equal(createdBitmaps.length, 2, "Should have created two ImageBitmaps");
        assert.equal(closedBitmaps, 1, "Should have closed the ImageBitmap for the overwritten entry");
    });

    it("handles async promotion race where entry is evicted before promise resolves", async () => {
        const cache = createBakedSpriteCache({ maxItems: 1 });
        createdBitmaps = [];
        closedBitmaps = 0;

        const canvas1 = acquireOffscreenCanvas(876, 543);
        cache.set("item1", canvas1);

        // Evict item1 by setting item2 (cache maxItems = 1)
        const canvas2 = acquireOffscreenCanvas(876, 543);
        cache.set("item2", canvas2);

        // Wait for async promotions to settle
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify item1 was released to pool
        const canvasRecycled = acquireOffscreenCanvas(876, 543);
        assert.equal(canvasRecycled, canvas1, "The evicted OffscreenCanvas should be released back to the pool");

        // Verify that the promoted bitmap for item1 was closed
        assert.equal(closedBitmaps, 1, "The ImageBitmap of the evicted entry should be closed");
    });
});

describe("WorldSurfaceEngine Leak Auditing", () => {
    it("closes bitmaps when surface bake returns invalid/non-drawable bitmaps", async () => {
        const settings = createGameWorldSurfaceSettings();
        const engine = new WorldSurfaceEngine(settings);

        let closedBitmapsCount = 0;
        const mockBitmap = {
            width: 0, // Invalid width
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
            const obstacleGrid = {
                cols: 8,
                rows: 8,
                minX: 0,
                minY: 0,
                cellSize: 16,
                collectStaticStructureZLevels: () => [0],
                worldCol: () => 0,
                worldRow: () => 0
            };
            const mockState = { obstacleGrid };

            engine.getGroundChunkCanvas(0, 0, mockState, 0, null, "test_profile");

            // Wait for async bake to reject due to invalid width
            await new Promise((resolve) => setTimeout(resolve, 50));

            assert.equal(closedBitmapsCount, 1, "The invalid ImageBitmap should have been closed to prevent leakage");
        } finally {
            TileWorkerCoordinator.requestGroundChunkBake = originalRequest;
        }
    });
});
