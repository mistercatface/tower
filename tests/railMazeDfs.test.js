import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeRailMazeDfs } from "../Libraries/Spatial/spatial.js";

describe("railMazeDfs", () => {
    it("builds edge-rail walls from a randomized DFS spanning tree", () => {
        const gridCols = 64;
        const rails = bakeRailMazeDfs(
            { originIdx: 34 * gridCols, cols: 64, rows: 30 },
            { corridorWidthMin: 1, corridorWidthMax: 2, railWallHeightLevel: 1, railWallThicknessLevel: 1 },
            1337,
            gridCols,
        );
        assert.ok(rails.length > 80, `expected rail maze walls, got ${rails.length}`);
        const minIdx = 34 * gridCols;
        for (let i = 0; i < rails.length; i++) {
            assert.ok(rails[i].idx >= minIdx, `rail idx ${rails[i].idx} leaked above rail zone`);
            assert.ok(rails[i].side >= 0 && rails[i].side <= 3);
        }
    });

    it("generates deterministically based on seed", () => {
        const gridCols = 64;
        const bounds = { originIdx: 34 * gridCols, cols: 64, rows: 30 };
        const opts = { corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 };
        const rails1 = bakeRailMazeDfs(bounds, opts, 42, gridCols);
        const rails2 = bakeRailMazeDfs(bounds, opts, 42, gridCols);
        const rails3 = bakeRailMazeDfs(bounds, opts, 43, gridCols);
        assert.equal(rails1.length, rails2.length, "Same seed should generate same number of rails");
        for (let i = 0; i < rails1.length; i++) assert.deepEqual(rails1[i], rails2[i], `Rail mismatch at index ${i}`);
        assert.ok(
            rails1.length !== rails3.length || rails1.some((r, i) => r.idx !== rails3[i].idx || r.side !== rails3[i].side),
            "Different seeds should produce different mazes",
        );
    });
});
