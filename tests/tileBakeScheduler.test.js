import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromiseWorkerPoolHost } from "../Libraries/Workers/PromiseWorkerPoolHost.js";
import { TILE_BAKE_TIER, TileBakeScheduler } from "../Libraries/WorldSurface/TileBakeScheduler.js";

function createMockWorker() {
    return {
        onmessage: null,
        onerror: null,
        postMessage() {},
        terminate() {},
    };
}

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
        chunkCol: 1,
        chunkRow: 2,
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
        const first = scheduler.enqueue("bakeGroundChunk", payload, TILE_BAKE_TIER.STATIC);
        const second = scheduler.enqueue("bakeGroundChunk", payload, TILE_BAKE_TIER.STATIC);
        assert.equal(first, second);
        assert.equal(posts.length, 1);
        assert.equal(scheduler.stats().inFlightDedupeCount, 1);
        assert.equal(scheduler.stats().pendingCount, 1);
    });

    it("does not dedupe registration broadcast jobs", () => {
        const { scheduler, posts } = createScheduler(3);
        const payload = { profileId: "lab", profile: { id: "lab" } };
        const first = scheduler.enqueue("registerRuntimeProfile", payload, TILE_BAKE_TIER.REGISTRATION);
        const second = scheduler.enqueue("registerRuntimeProfile", payload, TILE_BAKE_TIER.REGISTRATION);
        const third = scheduler.enqueue("registerRuntimeProfile", payload, TILE_BAKE_TIER.REGISTRATION);
        assert.notEqual(first, second);
        assert.notEqual(second, third);
        assert.equal(posts.length, 3);
        assert.equal(scheduler.stats().inFlightDedupeCount, 0);
    });

    it("drops obsolete revision jobs without posting to workers", async () => {
        let revision = 1;
        const { scheduler, pool, posts } = createScheduler(1, () => revision);
        scheduler.enqueue("bakeGroundChunk", chunkPayload({ chunkCol: 5 }), TILE_BAKE_TIER.STATIC);
        const queued = scheduler.enqueue("bakeGroundChunk", chunkPayload({ chunkCol: 0 }), TILE_BAKE_TIER.STATIC);
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
        const far = scheduler.enqueue("bakeGroundChunk", chunkPayload({ centerX: 0, centerY: 0 }), TILE_BAKE_TIER.STATIC);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].payload.centerX, 0);
        const near = scheduler.enqueue("bakeGroundChunk", chunkPayload({ chunkCol: 9, centerX: 200, centerY: 0 }), TILE_BAKE_TIER.STATIC);
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
        scheduler.enqueue("bakeGroundChunk", chunkPayload(), TILE_BAKE_TIER.STATIC);
        const stats = scheduler.stats();
        assert.equal(stats.queueSize, 0);
        assert.equal(stats.pendingCount, 1);
        assert.equal(stats.inFlightDedupeCount, 1);
        assert.equal(stats.busyWorkers, 1);
    });
});
