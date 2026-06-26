import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SeededNoise2D, setNoiseProfileEnabled } from "../Libraries/Procedural/Noise/SeededNoise2D.js";

describe("SeededNoise2D", () => {
    it("returns deterministic values for the same seed and coordinates", () => {
        const a = new SeededNoise2D(12345);
        const b = new SeededNoise2D(12345);
        assert.equal(a.sample2D(0.5, 1.25, 2), b.sample2D(0.5, 1.25, 2));
        assert.equal(a.sample2D(-3.2, 9.1, 3), b.sample2D(-3.2, 9.1, 3));
    });
    it("changes output when seed changes", () => {
        const a = new SeededNoise2D(1);
        const b = new SeededNoise2D(2);
        assert.notEqual(a.sample2D(0.37, 1.82, 2), b.sample2D(0.37, 1.82, 2));
    });
    it("setSeed reuses perm table without changing unrelated instances", () => {
        const noise = new SeededNoise2D(10);
        const before = noise.sample2D(0.37, 1.82, 1);
        noise.setSeed(10);
        assert.equal(noise.sample2D(0.37, 1.82, 1), before);
        noise.setSeed(99);
        assert.notEqual(noise.sample2D(0.37, 1.82, 1), before);
    });
    it("fromDerived produces stable sub-seeds", () => {
        const root = 4242;
        const warp = SeededNoise2D.fromDerived(root, "warp");
        const motif = SeededNoise2D.fromDerived(root, "motif");
        assert.notEqual(warp.sample2D(0.37, 1.82, 1), motif.sample2D(0.37, 1.82, 1));
        assert.equal(SeededNoise2D.fromDerived(root, "warp").sample2D(0.37, 1.82, 1), warp.sample2D(0.37, 1.82, 1));
    });
    it("memoizes repeated samples until beginPixel clears the slot table", () => {
        setNoiseProfileEnabled(true);
        const noise = new SeededNoise2D(7, 4);
        noise.resetProfile();
        noise.beginPixel();
        noise.sample2D(1, 2, 2);
        noise.sample2D(1, 2, 2);
        noise.sample2D(3, 4, 2);
        assert.equal(noise.profile.calls, 3);
        assert.equal(noise.profile.hits, 1);
        noise.beginPixel();
        noise.sample2D(1, 2, 2);
        assert.equal(noise.profile.calls, 4);
        assert.equal(noise.profile.hits, 1);
        setNoiseProfileEnabled(false);
    });
});
