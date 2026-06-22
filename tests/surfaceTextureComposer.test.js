import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeededNoise2D, setNoiseProfileEnabled } from "../Libraries/Procedural/Noise/SeededNoise2D.js";
import { composeSurfaceImage } from "../Libraries/Procedural/SurfaceTextureComposer.js";

function makeSamples(width, height) {
    const numPixels = width * height;
    const evalX = new Float32Array(numPixels);
    const evalY = new Float32Array(numPixels);
    const lookupX = new Float32Array(numPixels);
    const lookupY = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
        evalX[i] = i * 0.37;
        evalY[i] = i * 0.19;
    }
    return { width, height, evalX, evalY, lookupX, lookupY, wallU: new Float32Array(numPixels), wallV: new Float32Array(numPixels) };
}

describe("composeSurfaceImage pass 3", () => {
    it("skips domain warp noise when the active stack is eval-only", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(99);
        const bakeSession = { noiseEvaluator: noise };
        const samples = makeSamples(4, 4);
        const profile = {
            warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [0, 0] },
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 1, rgbDelta: [1, 1, 1] }, grain: { frequency: 0.4, octaves: 1, amplitude: 1 } },
                { type: "stainBlotch", coordinateSpace: "eval", frequency: 0.012, threshold: 0.45, peak: 4, octaves: 1, tint: [1, 1, 1] },
            ],
        };
        noise.resetProfile();
        composeSurfaceImage(samples, profile, 42, bakeSession, { useWallBase: false });
        assert.equal(noise.profile.calls / 16, 3);
        setNoiseProfileEnabled(false);
    });
    it("precomputes domain warp when a warped motif is active", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(99);
        const bakeSession = { noiseEvaluator: noise };
        const samples = makeSamples(4, 4);
        const profile = {
            warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [0, 0] },
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 1, rgbDelta: [1, 1, 1] }, grain: { frequency: 0.4, octaves: 1, amplitude: 1 } },
                { type: "circuitTraces", coordinateSpace: "warped", gridSize: 24, lineWidth: 2, density: 0.5, peak: 8, tint: [1, 1, 1] },
            ],
        };
        noise.resetProfile();
        composeSurfaceImage(samples, profile, 42, bakeSession, { useWallBase: false });
        assert.equal(noise.profile.calls / 16, 4);
        setNoiseProfileEnabled(false);
    });
    it("runs trailing post filters after color motifs without extra noise", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(99);
        const bakeSession = { noiseEvaluator: noise };
        const samples = makeSamples(4, 4);
        const profile = {
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "surfaceGrain", frequency: 0.05, octaves: 1, amplitude: 1, tint: [1, 1, 1] },
                { type: "filterHSV", hueShift: 0, saturation: 1.2, value: 0.9, blendMode: "replace" },
            ],
        };
        noise.resetProfile();
        const rgb = composeSurfaceImage(samples, profile, 42, bakeSession, { useWallBase: false });
        assert.equal(noise.profile.calls / 16, 1);
        assert.equal(rgb.length, 16 * 3);
        setNoiseProfileEnabled(false);
    });
});
