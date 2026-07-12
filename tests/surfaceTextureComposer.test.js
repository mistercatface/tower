import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseMetalMotif } from "../Libraries/Procedural/Motifs/baseMetal.js";
import { deckPlatesMotif } from "../Libraries/Procedural/Motifs/deckPlates.js";
import { filterHSVMotif } from "../Libraries/Procedural/Motifs/Filters/filterHSV.js";
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
        const bakeSession = { noiseEvaluator: noise, useWallBase: false };
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
        composeSurfaceImage(samples, profile, 42, bakeSession);
        assert.equal(noise.profile.calls / 16, 3);
        setNoiseProfileEnabled(false);
    });
    it("precomputes domain warp when a warped motif is active", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(99);
        const bakeSession = { noiseEvaluator: noise, useWallBase: false };
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
        composeSurfaceImage(samples, profile, 42, bakeSession);
        assert.equal(noise.profile.calls / 16, 4);
        setNoiseProfileEnabled(false);
    });
    it("runs trailing post filters after color motifs without extra noise", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(99);
        const bakeSession = { noiseEvaluator: noise, useWallBase: false };
        const samples = makeSamples(4, 4);
        const profile = {
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "surfaceGrain", frequency: 0.05, octaves: 1, amplitude: 1, tint: [1, 1, 1] },
                { type: "filterHSV", hueShift: 0, saturation: 1.2, value: 0.9, blendMode: "replace" },
            ],
        };
        noise.resetProfile();
        const rgb = composeSurfaceImage(samples, profile, 42, bakeSession);
        assert.equal(noise.profile.calls / 16, 1);
        assert.equal(rgb.length, 16 * 3);
        setNoiseProfileEnabled(false);
    });
    it("matches fallback output for compiled hot motif runners", () => {
        const samples = makeSamples(8, 8);
        const profile = {
            palette: { base: [12, 10, 8], floorBase: [12, 10, 8] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 2, rgbDelta: [3, 2, 1] }, grain: { frequency: 0.4, octaves: 2, amplitude: 0.8 }, blendMode: "add" },
                {
                    type: "deckPlates",
                    cellWorldSize: 32,
                    plateCells: 2,
                    plateRows: 2,
                    groutWidth: 0.04,
                    groutPeak: 12,
                    groutTint: [-10, -10, -8],
                    plateVariation: 6,
                    jitterOffset: [0, 0],
                    rivetSpacing: 16,
                    rivetInset: 4,
                    rivetRadius: 0.018,
                    rivetPeak: 8,
                    rivetTint: [1.2, 0.8, 0.5],
                    blendMode: "multiply",
                },
                { type: "filterHSV", hueShift: 15, saturation: 1.4, value: 0.85, blendMode: "replace" },
            ],
        };
        const compiled = composeSurfaceImage(samples, profile, 42, { noiseEvaluator: new SeededNoise2D(99), useWallBase: false });
        const compilers = [baseMetalMotif.compile, deckPlatesMotif.compile, filterHSVMotif.compile];
        delete baseMetalMotif.compile;
        delete deckPlatesMotif.compile;
        delete filterHSVMotif.compile;
        try {
            const fallback = composeSurfaceImage(samples, profile, 42, { noiseEvaluator: new SeededNoise2D(99), useWallBase: false });
            assert.deepEqual(Array.from(compiled), Array.from(fallback));
        } finally {
            baseMetalMotif.compile = compilers[0];
            deckPlatesMotif.compile = compilers[1];
            filterHSVMotif.compile = compilers[2];
        }
    });
});
