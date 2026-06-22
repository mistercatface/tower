import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromiseWorkerPoolHost } from "../Libraries/Workers/PromiseWorkerPoolHost.js";
import { TileBakeScheduler } from "../Libraries/WorldSurface/TileBakeScheduler.js";
import { TILE_WORKER_MESSAGE } from "../Libraries/WorldSurface/TileWorkerMessages.js";
import { TileSurfaceWorkerClient } from "../Libraries/WorldSurface/TileSurfaceWorkerClient.js";
function createMockWorker() {
    return { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
}
function createTestClient() {
    const posts = [];
    const pool = new PromiseWorkerPoolHost("fake-url", { poolSize: 1, createWorker: () => createMockWorker(), onJobComplete: () => {} });
    const scheduler = new TileBakeScheduler(pool, { getProfileRevision: () => 1 });
    pool.onJobComplete = (workerIndex, result) => scheduler.finishJob(workerIndex, result);
    const originalPostJob = pool.postJob.bind(pool);
    pool.postJob = (index, message) => {
        posts.push(message);
        originalPostJob(index, message);
    };
    const client = new TileSurfaceWorkerClient("fake-url", { pool, scheduler });
    return { client, pool, scheduler, posts };
}
describe("TileSurfaceWorkerClient", () => {
    it("returns empty stats before the pool starts", () => {
        const { client } = createTestClient();
        assert.deepEqual(client.stats(), { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0 });
    });
    it("stores focus before the pool starts and applies it on first bake", () => {
        const { client } = createTestClient();
        client.updateFocus(128, 64);
        client._ensureStarted();
        assert.equal(client.scheduler.focusX, 128);
        assert.equal(client.scheduler.focusY, 64);
    });
    it("uses shared tile worker message types for bake requests", async () => {
        const { client, pool, scheduler, posts } = createTestClient();
        const payload = { profileId: "x", chunkCol: 0, chunkRow: 0, seed: 0, frameStart: 0, frameCount: 1 };
        const promise = client._sendRequest(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, payload, 0);
        await new Promise((resolve) => queueMicrotask(resolve));
        assert.equal(posts[0].type, TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK);
        pool.forEachSlot((_index, slot) => {
            slot.busy = false;
            slot.meta = null;
        });
        scheduler.finishJob(0, { id: posts[0].id, bitmaps: [] });
        await promise;
    });
    it("shutdown clears started state", () => {
        const { client } = createTestClient();
        client._ensureStarted();
        assert.equal(client._started, true);
        client.shutdown();
        assert.equal(client._started, false);
        assert.deepEqual(client.stats(), { queueSize: 0, pendingCount: 0, inFlightDedupeCount: 0, busyWorkers: 0 });
    });
});
