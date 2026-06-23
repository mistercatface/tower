import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashSaltString } from "../Libraries/Math/hash.js";
import { writeSeededFeatureCell } from "../Libraries/Procedural/Fields/SeededFeatureHash.js";
import { voronoiEdgeMetric } from "../Libraries/Procedural/Fields/VoronoiEdge.js";

describe("SeededFeatureHash", () => {
    it("writes deterministic jitter into caller-owned storage", () => {
        const out = { fx: 0, fy: 0 };
        const first = writeSeededFeatureCell(out, 9, -12, 4321);
        assert.equal(first, out);
        assert.deepEqual({ ...out }, writeSeededFeatureCell({ fx: 0, fy: 0 }, 9, -12, 4321));
        assert.notDeepEqual({ ...out }, writeSeededFeatureCell({ fx: 0, fy: 0 }, 9, -12, 4322));
    });

    it("derives stable salted sub-seeds", () => {
        assert.equal(hashSaltString(1234, "worley"), hashSaltString(1234, "worley"));
        assert.notEqual(hashSaltString(1234, "worley"), hashSaltString(1234, "biome"));
    });

    it("returns stable jitter for the same cell and seed", () => {
        const out = { fx: 0, fy: 0 };
        writeSeededFeatureCell(out, -3, 4, 1);
        const snap = { fx: out.fx, fy: out.fy };
        writeSeededFeatureCell(out, -3, 4, 1);
        assert.deepEqual(snap, { fx: out.fx, fy: out.fy });
        writeSeededFeatureCell(out, 0, 0, 42);
        const snapA = { fx: out.fx, fy: out.fy };
        writeSeededFeatureCell(out, 0, 0, 43);
        assert.notDeepEqual(snapA, { fx: out.fx, fy: out.fy });
    });
});

describe("voronoiEdgeMetric", () => {
    it("uses the shared root seed and salt contract", () => {
        const rootSeed = 4242;
        const salt = "surface-worley";
        const density = 0.04;
        const derivedSeed = hashSaltString(rootSeed, salt);
        assert.equal(voronoiEdgeMetric(18, -33, density, derivedSeed), voronoiEdgeMetric(18, -33, density, derivedSeed));
    });

    it("returns stable edge metric samples", () => {
        assert.equal(voronoiEdgeMetric(0, 0, 0.035, 7), voronoiEdgeMetric(0, 0, 0.035, 7));
        assert.notEqual(voronoiEdgeMetric(0, 0, 0.035, 7), voronoiEdgeMetric(12.5, -4.25, 0.08, 99));
    });
});
