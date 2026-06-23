import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GridSiteField } from "../Libraries/Procedural/Fields/GridSiteField.js";
import { hashSaltString } from "../Libraries/Math/hash.js";
import { writeSeededFeatureCell } from "../Libraries/Procedural/Fields/SeededFeatureHash.js";
import { WorleyEdgeField, voronoiEdgeMetric } from "../Libraries/Procedural/Fields/VoronoiEdge.js";

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

describe("WorleyEdgeField", () => {
    it("uses the shared root seed and salt contract", () => {
        const rootSeed = 4242;
        const salt = "surface-worley";
        const density = 0.04;
        const field = new WorleyEdgeField(rootSeed, salt, density);
        const derivedSeed = hashSaltString(rootSeed, salt);
        assert.equal(field.sampleEdge(18, -33), voronoiEdgeMetric(18, -33, density, derivedSeed));
    });

    it("returns stable edge metric samples", () => {
        assert.equal(voronoiEdgeMetric(0, 0, 0.035, 7), voronoiEdgeMetric(0, 0, 0.035, 7));
        assert.notEqual(voronoiEdgeMetric(0, 0, 0.035, 7), voronoiEdgeMetric(12.5, -4.25, 0.08, 99));
    });
});

describe("GridSiteField", () => {
    it("returns deterministic jittered site points in cell space", () => {
        const a = new GridSiteField(9001, "rooms", 32);
        const b = new GridSiteField(9001, "rooms", 32);
        const siteA = a.site(4, -2);
        const siteB = b.site(4, -2);
        assert.deepEqual(siteA, siteB);
        assert.equal(siteA.col, 4);
        assert.equal(siteA.row, -2);
        assert.ok(siteA.x >= 4 * 32 && siteA.x <= 5 * 32);
        assert.ok(siteA.y >= -2 * 32 && siteA.y <= -1 * 32);
    });

    it("separates placement domains by salt", () => {
        const rooms = new GridSiteField(1234, "rooms", 1);
        const biome = new GridSiteField(1234, "biome", 1);
        assert.notDeepEqual(rooms.site(7, 9), biome.site(7, 9));
    });

    it("writes into caller-owned output", () => {
        const field = new GridSiteField(222, "placement", 10);
        const out = { col: 0, row: 0, jitterX: 0, jitterY: 0, x: 0, y: 0, rank: 0 };
        const site = field.writeSite(out, -3, 5);
        assert.equal(site, out);
        assert.deepEqual({ ...out }, field.site(-3, 5));
    });

    it("sorts cells by deterministic rank without mutating the input", () => {
        const field = new GridSiteField(77, "order", 1);
        const cells = [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
        ];
        const sortedA = field.sortedCells(cells);
        const sortedB = new GridSiteField(77, "order", 1).sortedCells(cells);
        assert.deepEqual(sortedA, sortedB);
        assert.notEqual(sortedA, cells);
        assert.deepEqual(cells, [
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 0, row: 1 },
            { col: 1, row: 1 },
        ]);
        for (let i = 1; i < sortedA.length; i++) {
            const prev = sortedA[i - 1];
            const curr = sortedA[i];
            assert.ok(field.compareCells(prev.col, prev.row, curr.col, curr.row) <= 0);
        }
    });
});
