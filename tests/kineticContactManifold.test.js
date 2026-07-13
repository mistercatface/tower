import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactWarmStartKeyFromPairKey, pairPhysKey, quantizeContactFeatureId } from "../Libraries/Physics/physics.js";

describe("kinetic contact manifold keys", () => {
    it("opposing normals get different warm-start keys for the same pair", () => {
        const pairKey = pairPhysKey(2, 5);
        const right = contactWarmStartKeyFromPairKey(pairKey, 1, 0);
        const left = contactWarmStartKeyFromPairKey(pairKey, -1, 0);
        assert.notEqual(right, left);
    });

    it("quantizes nearby normals into the same feature bucket", () => {
        const a = quantizeContactFeatureId(1, 0);
        const b = quantizeContactFeatureId(0.98, 0.08);
        assert.equal(a, b);
    });

    it("zero normal maps to feature id 0", () => {
        assert.equal(quantizeContactFeatureId(0, 0), 0);
        const pairKey = pairPhysKey(1, 3);
        assert.equal(contactWarmStartKeyFromPairKey(pairKey, 0, 0), pairKey * 65536);
    });

    it("packs distinct part indices into distinct warm-start keys", () => {
        const pairKey = pairPhysKey(1, 3);
        const part0 = contactWarmStartKeyFromPairKey(pairKey, 0, 0);
        const part1 = contactWarmStartKeyFromPairKey(pairKey, 1, 0);
        assert.notEqual(part0, part1);
    });
});
