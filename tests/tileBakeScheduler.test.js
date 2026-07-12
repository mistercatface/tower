import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromiseWorkerPoolHost } from "../Libraries/Workers/PromiseWorkerPoolHost.js";
import { TILE_BAKE_TIER_REGISTRATION, TILE_BAKE_TIER_STATIC, TILE_WORKER_MESSAGE, TileBakeScheduler } from "../Libraries/WorldSurface/worldSurface.js";
import { packChunkKey } from "../Libraries/Spatial/spatial.js";

import { createMockWorker } from "./harness/mockWorkerHarness.js";
function createTestPool(poolSize) {
    return new PromiseWorkerPoolHost("fake-url", {
        poolSize,
        createWorker: () => createMockWorker(),
        onJobComplete: () => {},
    });
}

function chunkPayload(overrides = {}) {
    return {
        profileId: "testProfile",
        chunkKey: packChunkKey(1, 2),
        seed: 42,
        zLevel: 0,
        centerX: 0,
        centerY: 0,
        ...overrides,
    };
}

function createScheduler(poolSize, getProfileRevision = () => 1) {
    const posts = [];
    const pool = createTestPool(poolSize, (msg) => posts.push(msg));
    pool.onJobComplete = () => {};
    const scheduler = new TileBakeScheduler(pool, { getProfileRevision });
    pool.onJobComplete = (workerIndex, result) => scheduler.finishJob(workerIndex, result);
    pool.ensureStarted();
    const originalPostJob = pool.postJob.bind(pool);
    pool.postJob = (index, message) => {
        posts.push(message);
        originalPostJob(index, message);
    };
    return { scheduler, pool, posts };
}

describe("TileBakeScheduler", () => {
    it("coalesces duplicate ground-chunk enqueues to one worker post", () => {
        const { scheduler, posts } = createScheduler(1);
        const payload = chunkPayload();
        const first = scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, payload, TILE_BAKE_TIER_STATIC);
        const second = scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, payload, TILE_BAKE_TIER_STATIC);
        assert.equal(first, second);
        assert.equal(posts.length, 1);
        assert.equal(scheduler.stats().inFlightDedupeCount, 1);
        assert.equal(scheduler.stats().pendingCount, 1);
    });

    it("does not dedupe registration broadcast jobs", () => {
        const { scheduler, posts } = createScheduler(3);
        const payload = { id: "lab" };
        const first = scheduler.enqueue(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, payload, TILE_BAKE_TIER_REGISTRATION);
        const second = scheduler.enqueue(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, payload, TILE_BAKE_TIER_REGISTRATION);
        const third = scheduler.enqueue(TILE_WORKER_MESSAGE.REGISTER_RUNTIME_PROFILE, payload, TILE_BAKE_TIER_REGISTRATION);
        assert.notEqual(first, second);
        assert.notEqual(second, third);
        assert.equal(posts.length, 3);
        assert.equal(scheduler.stats().inFlightDedupeCount, 0);
    });

    it("drops obsolete revision jobs without posting to workers", async () => {
        let revision = 1;
        const { scheduler, pool, posts } = createScheduler(1, () => revision);
        scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, chunkPayload({ chunkKey: packChunkKey(5, 0) }), TILE_BAKE_TIER_STATIC);
        const queued = scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, chunkPayload({ chunkKey: packChunkKey(0, 0) }), TILE_BAKE_TIER_STATIC);
        revision = 2;
        pool.forEachSlot((index, slot) => {
            slot.busy = false;
            slot.meta = null;
        });
        scheduler.finishJob(0, { id: posts[0].id, bitmaps: ["done"] });
        const bitmaps = await queued;
        assert.deepEqual(bitmaps, []);
        assert.equal(posts.length, 1);
        assert.equal(scheduler.stats().inFlightDedupeCount, 0);
    });

    it("dispatches nearer focus jobs first after camera moves", async () => {
        const { scheduler, pool, posts } = createScheduler(1);
        const far = scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, chunkPayload({ centerX: 0, centerY: 0 }), TILE_BAKE_TIER_STATIC);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].payload.centerX, 0);
        const near = scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, chunkPayload({ chunkKey: packChunkKey(9, 0), centerX: 200, centerY: 0 }), TILE_BAKE_TIER_STATIC);
        assert.notEqual(far, near);
        scheduler.updateFocus(200, 0);
        pool.forEachSlot((index, slot) => {
            slot.busy = false;
            slot.meta = null;
        });
        scheduler.finishJob(0, { id: posts[0].id, bitmaps: [] });
        assert.equal(posts.length, 2);
        assert.equal(posts[1].payload.centerX, 200);
    });

    it("stats reflect queue and busy workers", () => {
        const { scheduler } = createScheduler(2);
        scheduler.enqueue(TILE_WORKER_MESSAGE.BAKE_GROUND_CHUNK, chunkPayload(), TILE_BAKE_TIER_STATIC);
        const stats = scheduler.stats();
        assert.equal(stats.queueSize, 0);
        assert.equal(stats.pendingCount, 1);
        assert.equal(stats.inFlightDedupeCount, 1);
        assert.equal(stats.busyWorkers, 1);
    });
});
