import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactWarmStartKey, quantizeContactFeatureId } from "../Libraries/Spatial/collision/kineticContactManifold.js";

describe("kinetic contact manifold keys", () => {
    it("opposing normals get different warm-start keys for the same pair", () => {
        const pairKey = 2 * 1_000_000 + 5;
        const right = contactWarmStartKey(pairKey, 1, 0);
        const left = contactWarmStartKey(pairKey, -1, 0);
        assert.notEqual(right, left);
    });

    it("quantizes nearby normals into the same feature bucket", () => {
        const a = quantizeContactFeatureId(1, 0);
        const b = quantizeContactFeatureId(0.98, 0.08);
        assert.equal(a, b);
    });

    it("zero normal maps to feature id 0", () => {
        assert.equal(quantizeContactFeatureId(0, 0), 0);
        const pairKey = 1000003;
        assert.equal(contactWarmStartKey(pairKey, 0, 0), pairKey * 32);
    });
});
