import { setNoiseProfileEnabled } from "../Procedural/Noise/Perlin2D.js";
export const EMPTY_BAKE_TIMING_STATS = {
    sampleCount: 0,
    sampleFillMs: 0,
    composeStaticMs: 0,
    composeFrameMs: 0,
    rgbaCopyMs: 0,
    transferMs: 0,
    noiseCallsPerPixel: 0,
    noiseHitRate: 0,
    noiseOverflowRate: 0,
};
let tileBakeMetricsEnabled = false;
export function isTileBakeMetricsEnabled() {
    return tileBakeMetricsEnabled;
}
export function setTileBakeMetricsEnabled(enabled) {
    tileBakeMetricsEnabled = Boolean(enabled);
    setNoiseProfileEnabled(enabled);
}
export function installTileBakeMetricsEnabled(enabled) {
    setTileBakeMetricsEnabled(enabled);
}
export function createEmptyBakePhases() {
    return { sampleFillMs: 0, composeStaticMs: 0, composeFrameMs: 0, rgbaCopyMs: 0, transferMs: 0 };
}
export function createNoiseProfileSnapshot(profile, numPixels) {
    const calls = profile.calls;
    return {
        calls,
        hits: profile.hits,
        overflows: profile.overflows,
        numPixels,
        callsPerPixel: numPixels > 0 ? calls / numPixels : 0,
        hitRate: calls > 0 ? profile.hits / calls : 0,
        overflowRate: calls > 0 ? profile.overflows / calls : 0,
    };
}
export function createTileBakeMetrics(jobType, numPixels, phases, noiseProfile) {
    return { jobType, numPixels, phases: { ...phases }, noise: createNoiseProfileSnapshot(noiseProfile, numPixels) };
}
export class TileBakeMetricsAccumulator {
    constructor(windowSize = 32) {
        this.windowSize = windowSize;
        this.samples = [];
    }
    record(metrics) {
        if (!metrics) return;
        this.samples.push(metrics);
        if (this.samples.length > this.windowSize) this.samples.shift();
    }
    averages() {
        if (this.samples.length === 0) return { ...EMPTY_BAKE_TIMING_STATS };
        let sampleFillMs = 0;
        let composeStaticMs = 0;
        let composeFrameMs = 0;
        let rgbaCopyMs = 0;
        let transferMs = 0;
        let noiseCallsPerPixel = 0;
        let noiseHitRate = 0;
        let noiseOverflowRate = 0;
        const n = this.samples.length;
        for (let i = 0; i < n; i++) {
            const sample = this.samples[i];
            const phases = sample.phases;
            sampleFillMs += phases.sampleFillMs;
            composeStaticMs += phases.composeStaticMs;
            composeFrameMs += phases.composeFrameMs;
            rgbaCopyMs += phases.rgbaCopyMs;
            transferMs += phases.transferMs ?? 0;
            noiseCallsPerPixel += sample.noise.callsPerPixel;
            noiseHitRate += sample.noise.hitRate;
            noiseOverflowRate += sample.noise.overflowRate;
        }
        return {
            sampleCount: n,
            sampleFillMs: sampleFillMs / n,
            composeStaticMs: composeStaticMs / n,
            composeFrameMs: composeFrameMs / n,
            rgbaCopyMs: rgbaCopyMs / n,
            transferMs: transferMs / n,
            noiseCallsPerPixel: noiseCallsPerPixel / n,
            noiseHitRate: noiseHitRate / n,
            noiseOverflowRate: noiseOverflowRate / n,
        };
    }
}
export function formatTileBakeMetricsLog(type, metrics, transferMs = 0) {
    const phases = metrics.phases;
    const noise = metrics.noise;
    return (
        `[TileWorker] ${type} | sampleFill: ${phases.sampleFillMs.toFixed(2)}ms` +
        ` | composeStatic: ${phases.composeStaticMs.toFixed(2)}ms` +
        ` | composeFrame: ${phases.composeFrameMs.toFixed(2)}ms` +
        ` | rgbaCopy: ${phases.rgbaCopyMs.toFixed(2)}ms` +
        ` | transfer: ${transferMs.toFixed(2)}ms` +
        ` | noise: ${noise.callsPerPixel.toFixed(2)} calls/px` +
        ` hit ${(noise.hitRate * 100).toFixed(1)}%` +
        ` overflow ${(noise.overflowRate * 100).toFixed(1)}%` +
        ` (${metrics.numPixels}px)`
    );
}
