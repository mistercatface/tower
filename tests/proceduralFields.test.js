import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GridSiteField } from "../Libraries/Procedural/Fields/GridSiteField.js";
import { deriveFeatureSeed, seededFeatureCell, writeSeededFeatureCell } from "../Libraries/Procedural/Fields/SeededFeatureHash.js";
import { WorleyEdgeField, voronoiEdgeMetric } from "../Libraries/Procedural/Fields/VoronoiEdge.js";

function legacyHashCell(cellX, cellY, seed) {
    let h = (seed ^ Math.imul(cellX | 0, 374761393)) >>> 0;
    h = (h ^ Math.imul(cellY | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return { fx: (h & 0xffff) / 0xffff, fy: ((h >>> 16) & 0xffff) / 0xffff };
}

function legacyVoronoiEdgeMetric(worldX, worldY, density, seed) {
    const px = worldX * density;
    const py = worldY * density;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    let minDist = Infinity;
    let secondMin = Infinity;
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const cx = ix + dx;
            const cy = iy + dy;
            const { fx, fy } = legacyHashCell(cx, cy, seed);
            const featureX = cx + fx;
            const featureY = cy + fy;
            const dist = Math.hypot(px - featureX, py - featureY);
            if (dist < minDist) {
                secondMin = minDist;
                minDist = dist;
            } else if (dist < secondMin) secondMin = dist;
        }
    return secondMin - minDist;
}

describe("SeededFeatureHash", () => {
    it("matches the previous Worley cell jitter hash", () => {
        const cells = [
            [-3, 4, 1],
            [0, 0, 42],
            [17, -8, 98765],
        ];
        for (const [cellX, cellY, seed] of cells) assert.deepEqual(seededFeatureCell(cellX, cellY, seed), legacyHashCell(cellX, cellY, seed));
    });

    it("writes deterministic jitter into caller-owned storage", () => {
        const out = { fx: 0, fy: 0 };
        const first = writeSeededFeatureCell(out, 9, -12, 4321);
        assert.equal(first, out);
        assert.deepEqual({ ...out }, writeSeededFeatureCell({ fx: 0, fy: 0 }, 9, -12, 4321));
        assert.notDeepEqual({ ...out }, writeSeededFeatureCell({ fx: 0, fy: 0 }, 9, -12, 4322));
    });

    it("derives stable salted sub-seeds", () => {
        assert.equal(deriveFeatureSeed(1234, "worley"), deriveFeatureSeed(1234, "worley"));
        assert.notEqual(deriveFeatureSeed(1234, "worley"), deriveFeatureSeed(1234, "biome"));
    });
});

describe("WorleyEdgeField", () => {
    it("preserves the existing voronoi edge metric", () => {
        const samples = [
            [0, 0, 0.035, 7],
            [12.5, -4.25, 0.08, 99],
            [128.75, 64.5, 0.0125, 123456],
        ];
        for (const [worldX, worldY, density, seed] of samples) assert.equal(voronoiEdgeMetric(worldX, worldY, density, seed), legacyVoronoiEdgeMetric(worldX, worldY, density, seed));
    });

    it("uses the shared root seed and salt contract", () => {
        const rootSeed = 4242;
        const salt = "surface-worley";
        const density = 0.04;
        const field = new WorleyEdgeField(rootSeed, salt, density);
        const derivedSeed = deriveFeatureSeed(rootSeed, salt);
        assert.equal(field.sampleEdge(18, -33), voronoiEdgeMetric(18, -33, density, derivedSeed));
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
