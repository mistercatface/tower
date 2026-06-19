import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeRailMazeDfs } from "../Libraries/Procedural/Mazes/railMazeDfs.js";

describe("railMazeDfs", () => {
    it("builds edge-rail walls from a randomized DFS spanning tree", () => {
        const rails = bakeRailMazeDfs(
            { originCol: 0, originRow: 34, cols: 64, rows: 30 },
            { corridorWidthMin: 1, corridorWidthMax: 2, railWallHeightLevel: 1, railWallThicknessLevel: 1 },
            1337,
        );
        assert.ok(rails.length > 80, `expected rail maze walls, got ${rails.length}`);
        for (let i = 0; i < rails.length; i++) {
            assert.ok(rails[i].row >= 34, `rail row ${rails[i].row} leaked above rail zone`);
            assert.ok(rails[i].side >= 0 && rails[i].side <= 3);
        }
    });

    it("generates deterministically based on seed", () => {
        const bounds = { originCol: 0, originRow: 34, cols: 64, rows: 30 };
        const opts = { corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 };
        const rails1 = bakeRailMazeDfs(bounds, opts, 42);
        const rails2 = bakeRailMazeDfs(bounds, opts, 42);
        const rails3 = bakeRailMazeDfs(bounds, opts, 43);
        assert.equal(rails1.length, rails2.length, "Same seed should generate same number of rails");
        for (let i = 0; i < rails1.length; i++) assert.deepEqual(rails1[i], rails2[i], `Rail mismatch at index ${i}`);
        assert.ok(
            rails1.length !== rails3.length || rails1.some((r, i) => r.col !== rails3[i].col || r.row !== rails3[i].row || r.side !== rails3[i].side),
            "Different seeds should produce different mazes",
        );
    });
});
