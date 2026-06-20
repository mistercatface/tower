import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactWarmStartKey, pairContactKey, quantizeContactFeatureId } from "../Libraries/Spatial/collision/kineticContactManifold.js";

describe("kinetic contact manifold keys", () => {
    it("opposing normals get different warm-start keys for the same pair", () => {
        const a = { id: 2 };
        const b = { id: 5 };
        const right = contactWarmStartKey(a, b, 1, 0);
        const left = contactWarmStartKey(a, b, -1, 0);
        assert.notEqual(right, left);
    });

    it("quantizes nearby normals into the same feature bucket", () => {
        const a = quantizeContactFeatureId(1, 0);
        const b = quantizeContactFeatureId(0.98, 0.08);
        assert.equal(a, b);
    });

    it("zero normal maps to feature id 0", () => {
        assert.equal(quantizeContactFeatureId(0, 0), 0);
        const a = { id: 1 };
        const b = { id: 3 };
        assert.equal(contactWarmStartKey(a, b, 0, 0), pairContactKey(a, b) * 32);
    });
});
