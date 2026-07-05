import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromiseWorkerPoolHost } from "../Libraries/Workers/PromiseWorkerPoolHost.js";

import { createMockBitmapWorker } from "./harness/mockWorkerHarness.js";
describe("PromiseWorkerPoolHost", () => {
    it("marks slots busy and reports completion by worker index", async () => {
        const completions = [];
        const pool = new PromiseWorkerPoolHost("fake-url", {
            poolSize: 2,
            createWorker: () => createMockBitmapWorker(),
            onJobComplete: (workerIndex, result) => completions.push({ workerIndex, ...result }),
        });
        pool.ensureStarted();
        assert.equal(pool.size, 2);
        assert.equal(pool.isBusy(0), false);

        pool.markBusy(0, { jobId: 7, tier: 0 });
        pool.postJob(0, { id: 7, type: "test", payload: {} });
        assert.equal(pool.isBusy(0), true);
        assert.deepEqual(pool.getMeta(0), { jobId: 7, tier: 0 });

        await new Promise((resolve) => queueMicrotask(resolve));
        assert.equal(pool.isBusy(0), false);
        assert.equal(pool.getMeta(0), null);
        assert.deepEqual(completions, [{ workerIndex: 0, id: 7, bitmaps: ["mock-bitmap"], error: undefined, metrics: undefined }]);
    });

    it("forEachIdle skips busy workers", () => {
        const pool = new PromiseWorkerPoolHost("fake-url", {
            poolSize: 3,
            createWorker: () => createMockBitmapWorker(),
        });
        pool.ensureStarted();
        pool.markBusy(1, { jobId: 1, tier: 0 });
        const idle = [];
        pool.forEachIdle((index) => idle.push(index));
        assert.deepEqual(idle, [0, 2]);
    });
});
