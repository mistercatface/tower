import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeRailMazeDfs } from "../Libraries/Spatial/spatial.js";

function railAt(batch, i) {
    const o = i << 2;
    return { idx: batch.data[o], side: batch.data[o + 1] };
}

describe("railMazeDfs", () => {
    it("builds edge-rail walls from a randomized DFS spanning tree", () => {
        const gridCols = 64;
        const originIdx = 34 * gridCols;
        const strideCols = 64;
        const cellCount = 64 * 30;
        const rails = bakeRailMazeDfs(originIdx, gridCols, strideCols, cellCount, { corridorWidthMin: 1, corridorWidthMax: 2, railWallHeightLevel: 1, railWallThicknessLevel: 1 }, 1337);
        assert.ok(rails.count > 80, `expected rail maze walls, got ${rails.count}`);
        const minIdx = originIdx;
        for (let i = 0; i < rails.count; i++) {
            const wall = railAt(rails, i);
            assert.ok(wall.idx >= minIdx, `rail idx ${wall.idx} leaked above rail zone`);
            assert.ok(wall.side >= 0 && wall.side <= 3);
        }
    });

    it("generates deterministically based on seed", () => {
        const gridCols = 64;
        const originIdx = 34 * gridCols;
        const strideCols = 64;
        const cellCount = 64 * 30;
        const opts = { corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25 };
        const rails1 = bakeRailMazeDfs(originIdx, gridCols, strideCols, cellCount, opts, 42);
        const rails2 = bakeRailMazeDfs(originIdx, gridCols, strideCols, cellCount, opts, 42);
        const rails3 = bakeRailMazeDfs(originIdx, gridCols, strideCols, cellCount, opts, 43);
        assert.equal(rails1.count, rails2.count, "Same seed should generate same number of rails");
        for (let i = 0; i < rails1.count; i++) {
            const a = railAt(rails1, i);
            const b = railAt(rails2, i);
            assert.equal(a.idx, b.idx, `Rail idx mismatch at index ${i}`);
            assert.equal(a.side, b.side, `Rail side mismatch at index ${i}`);
        }
        const rails3Differs =
            rails1.count !== rails3.count ||
            (() => {
                for (let i = 0; i < rails1.count; i++) {
                    const a = railAt(rails1, i);
                    const c = railAt(rails3, i);
                    if (a.idx !== c.idx || a.side !== c.side) return true;
                }
                return false;
            })();
        assert.ok(rails3Differs, "Different seeds should produce different mazes");
    });
});
