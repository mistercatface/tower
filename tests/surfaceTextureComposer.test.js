import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseMetalMotif } from "../Libraries/Procedural/Motifs/baseMetal.js";
import { deckPlatesMotif } from "../Libraries/Procedural/Motifs/deckPlates.js";
import { filterHSVMotif } from "../Libraries/Procedural/Motifs/Filters/filterHSV.js";
import { SeededNoise2D } from "../Libraries/Procedural/Noise/SeededNoise2D.js";
import { composeSurfaceImage } from "../Libraries/Procedural/SurfaceTextureComposer.js";
import { BakeSession, BI_WIDTH, BI_HEIGHT } from "../Libraries/WorldSurface/worldSurface.js";
import { BLEND_MODE_ADD, BLEND_MODE_MULTIPLY, BLEND_MODE_REPLACE, COORD_SPACE_EVAL, COORD_SPACE_WARPED } from "../Core/engineEnums.js";

class ProfiledSeededNoise2D extends SeededNoise2D {
    constructor(...args) {
        super(...args);
        this.profile = { calls: 0 };
    }
    sample2D(x, y, octaves = 2) {
        this.profile.calls++;
        return super.sample2D(x, y, octaves);
    }
}

function fillSessionSamples(bakeSession, width, height) {
    const numPixels = width * height;
    bakeSession._i32[BI_WIDTH] = width;
    bakeSession._i32[BI_HEIGHT] = height;
    bakeSession.evalX = new Float32Array(numPixels);
    bakeSession.evalY = new Float32Array(numPixels);
    bakeSession.lookupX = new Float32Array(numPixels);
    bakeSession.lookupY = new Float32Array(numPixels);
    bakeSession.wallU = new Float32Array(numPixels);
    bakeSession.wallV = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
        bakeSession.evalX[i] = i * 0.37;
        bakeSession.evalY[i] = i * 0.19;
    }
}
function floorBakeSession(noise, width = 4, height = 4) {
    const bakeSession = new BakeSession();
    bakeSession.noiseEvaluator = noise;
    bakeSession.configureFloor(16, 1);
    fillSessionSamples(bakeSession, width, height);
    return bakeSession;
}

describe("composeSurfaceImage pass 3", () => {
    it("skips domain warp noise when the active stack is eval-only", () => {
        const noise = new ProfiledSeededNoise2D(99);
        const bakeSession = floorBakeSession(noise);
        const profile = {
            warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [0, 0] },
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 1, rgbDelta: [1, 1, 1] }, grain: { frequency: 0.4, octaves: 1, amplitude: 1 } },
                { type: "stainBlotch", coordinateSpace: COORD_SPACE_EVAL, frequency: 0.012, threshold: 0.45, peak: 4, octaves: 1, tint: [1, 1, 1] },
            ],
        };
        composeSurfaceImage(bakeSession, profile, 42);
        assert.equal(noise.profile.calls / 16, 3);
    });
    it("precomputes domain warp when a warped motif is active", () => {
        const noise = new ProfiledSeededNoise2D(99);
        const bakeSession = floorBakeSession(noise);
        const profile = {
            warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [0, 0] },
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 1, rgbDelta: [1, 1, 1] }, grain: { frequency: 0.4, octaves: 1, amplitude: 1 } },
                { type: "circuitTraces", coordinateSpace: COORD_SPACE_WARPED, gridSize: 24, lineWidth: 2, density: 0.5, peak: 8, tint: [1, 1, 1] },
            ],
        };
        composeSurfaceImage(bakeSession, profile, 42);
        assert.equal(noise.profile.calls / 16, 4);
    });
    it("runs trailing post filters after color motifs without extra noise", () => {
        const noise = new ProfiledSeededNoise2D(99);
        const bakeSession = floorBakeSession(noise);
        const profile = {
            palette: { base: [10, 8, 6], floorBase: [10, 8, 6] },
            motifs: [
                { type: "surfaceGrain", frequency: 0.05, octaves: 1, amplitude: 1, tint: [1, 1, 1] },
                { type: "filterHSV", hueShift: 0, saturation: 1.2, value: 0.9, blendMode: BLEND_MODE_REPLACE },
            ],
        };
        const rgb = composeSurfaceImage(bakeSession, profile, 42);
        assert.equal(noise.profile.calls / 16, 1);
        assert.equal(rgb.length, 16 * 3);
    });
    it("matches fallback output for compiled hot motif runners", () => {
        const profile = {
            palette: { base: [12, 10, 8], floorBase: [12, 10, 8] },
            motifs: [
                { type: "baseMetal", structure: { frequency: 0.006, octaves: 2, rgbDelta: [3, 2, 1] }, grain: { frequency: 0.4, octaves: 2, amplitude: 0.8 }, blendMode: BLEND_MODE_ADD },
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
                    blendMode: BLEND_MODE_MULTIPLY,
                },
                { type: "filterHSV", hueShift: 15, saturation: 1.4, value: 0.85, blendMode: BLEND_MODE_REPLACE },
            ],
        };
        const compiled = composeSurfaceImage(floorBakeSession(new SeededNoise2D(99), 8, 8), profile, 42);
        const compilers = [baseMetalMotif.compile, deckPlatesMotif.compile, filterHSVMotif.compile];
        delete baseMetalMotif.compile;
        delete deckPlatesMotif.compile;
        delete filterHSVMotif.compile;
        try {
            const fallback = composeSurfaceImage(floorBakeSession(new SeededNoise2D(99), 8, 8), profile, 42);
            assert.deepEqual(Array.from(compiled), Array.from(fallback));
        } finally {
            baseMetalMotif.compile = compilers[0];
            deckPlatesMotif.compile = compilers[1];
            filterHSVMotif.compile = compilers[2];
        }
    });
});
