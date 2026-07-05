import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeededNoise2D } from "../Libraries/Procedural/Noise/SeededNoise2D.js";
import { EMPTY_BAKE_TIMING_STATS, TileBakeMetricsAccumulator, createNoiseProfileSnapshot, setTileBakeMetricsEnabled } from "../Libraries/WorldSurface/worldSurface.js";
import { TileBakeScheduler } from "../Libraries/WorldSurface/worldSurface.js";
import { PromiseWorkerPoolHost } from "../Libraries/Workers/PromiseWorkerPoolHost.js";

describe("tile bake metrics", () => {
    it("tracks noise hits, calls, and memo overflows when enabled", () => {
        setTileBakeMetricsEnabled(true);
        const noise = new SeededNoise2D(42, 2);
        noise.resetProfile();
        noise.sample2D(1, 2, 2);
        noise.sample2D(1, 2, 2);
        noise.sample2D(3, 4, 2);
        noise.sample2D(5, 6, 2);
        noise.sample2D(7, 8, 2);
        assert.equal(noise.profile.calls, 5);
        assert.equal(noise.profile.hits, 1);
        assert.equal(noise.profile.overflows, 2);
        const snapshot = createNoiseProfileSnapshot(noise.profile, 100);
        assert.equal(snapshot.callsPerPixel, 0.05);
        assert.equal(snapshot.hitRate, 0.2);
        assert.ok(Math.abs(snapshot.overflowRate - 0.4) < 1e-9);
        setTileBakeMetricsEnabled(false);
    });
    it("does not count noise profile when disabled", () => {
        setTileBakeMetricsEnabled(false);
        const noise = new SeededNoise2D(7, 4);
        noise.sample2D(1, 1, 1);
        noise.sample2D(2, 2, 1);
        assert.equal(noise.profile.calls, 0);
        assert.equal(noise.profile.hits, 0);
        assert.equal(noise.profile.overflows, 0);
    });
    it("accumulates rolling bake timing averages", () => {
        const accumulator = new TileBakeMetricsAccumulator(2);
        assert.deepEqual(accumulator.averages(), { ...EMPTY_BAKE_TIMING_STATS });
        accumulator.record({
            phases: { sampleFillMs: 2, composeStaticMs: 10, composeFrameMs: 0, rgbaCopyMs: 1, transferMs: 3 },
            noise: { callsPerPixel: 4, hitRate: 0.5, overflowRate: 0.1 },
        });
        accumulator.record({
            phases: { sampleFillMs: 4, composeStaticMs: 20, composeFrameMs: 6, rgbaCopyMs: 2, transferMs: 5 },
            noise: { callsPerPixel: 6, hitRate: 0.25, overflowRate: 0.2 },
        });
        const avg = accumulator.averages();
        assert.equal(avg.sampleCount, 2);
        assert.equal(avg.sampleFillMs, 3);
        assert.equal(avg.composeStaticMs, 15);
        assert.equal(avg.composeFrameMs, 3);
        assert.equal(avg.rgbaCopyMs, 1.5);
        assert.equal(avg.transferMs, 4);
        assert.equal(avg.noiseCallsPerPixel, 5);
        assert.equal(avg.noiseHitRate, 0.375);
        assert.ok(Math.abs(avg.noiseOverflowRate - 0.15) < 1e-9);
        accumulator.record({
            phases: { sampleFillMs: 0, composeStaticMs: 0, composeFrameMs: 0, rgbaCopyMs: 0, transferMs: 0 },
            noise: { callsPerPixel: 0, hitRate: 0, overflowRate: 0 },
        });
        assert.equal(accumulator.averages().sampleCount, 2);
    });
    it("scheduler stats include bakeTiming averages from worker metrics", () => {
        setTileBakeMetricsEnabled(true);
        const pool = new PromiseWorkerPoolHost("fake-url", {
            poolSize: 1,
            createWorker: () => ({ onmessage: null, onerror: null, postMessage() {}, terminate() {} }),
            onJobComplete: () => {},
        });
        const scheduler = new TileBakeScheduler(pool, { getProfileRevision: () => 1 });
        pool.onJobComplete = (workerIndex, result) => scheduler.finishJob(workerIndex, result);
        scheduler.finishJob(0, {
            id: 1,
            bitmaps: [],
            metrics: {
                phases: { sampleFillMs: 1, composeStaticMs: 8, composeFrameMs: 0, rgbaCopyMs: 2, transferMs: 1 },
                noise: { callsPerPixel: 3, hitRate: 0.4, overflowRate: 0.05, calls: 300, hits: 120, overflows: 15, numPixels: 100 },
            },
        });
        const stats = scheduler.stats();
        assert.equal(stats.bakeTiming.sampleCount, 1);
        assert.equal(stats.bakeTiming.composeStaticMs, 8);
        assert.equal(stats.bakeTiming.noiseCallsPerPixel, 3);
        setTileBakeMetricsEnabled(false);
    });
});
