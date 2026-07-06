import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeRailMazeDfs, WorldObstacleGrid, centerMapGenBoundsOnViewport, createDefaultMapGenBoundsConfig, getMapGenBoundsCenterWorld } from "../Libraries/Spatial/spatial.js";
function railAt(batch, i) {
    const o = i << 2;
    return { idx: batch.data[o], side: batch.data[o + 1] };
}
function northPerimeterRails(rails, originIdx, strideCols) {
    const out = new Set();
    for (let i = 0; i < rails.count; i++) {
        const wall = railAt(rails, i);
        if (wall.side === 0) out.add(wall.idx);
    }
    const missing = [];
    for (let c = 0; c < strideCols; c++) {
        const idx = originIdx + c;
        if (!out.has(idx)) missing.push(c);
    }
    return missing;
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
    it("seals the north perimeter on row 0", () => {
        const gridCols = 64;
        const originIdx = 0;
        const strideCols = 64;
        const cellCount = 64 * 64;
        const rails = bakeRailMazeDfs(originIdx, gridCols, strideCols, cellCount, { corridorWidthMin: 1, corridorWidthMax: 2, railWallHeightLevel: 1, railWallThicknessLevel: 1 }, 1337);
        const missing = northPerimeterRails(rails, originIdx, strideCols);
        assert.equal(missing.length, 0, `missing north perimeter rails at columns: ${missing.join(", ")}`);
    });
});
describe("centerMapGenBoundsOnViewport", () => {
    it("expands the grid and indexes a rect centered at world origin", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(128, 128, 256, 256);
        const config = { ...createDefaultMapGenBoundsConfig(), boundsMode: "rect", boundsCols: 64, boundsRows: 64 };
        centerMapGenBoundsOnViewport(grid, { x: 0, y: 0 }, config);
        assert.ok(config.boundsIdx >= 0, "boundsIdx must be valid after centering");
        const center = getMapGenBoundsCenterWorld(grid, config);
        assert.ok(Math.abs(center.x) < grid.cellHalfSize + 0.01, `expected x≈0, got ${center.x}`);
        assert.ok(Math.abs(center.y) < grid.cellHalfSize + 0.01, `expected y≈0, got ${center.y}`);
        assert.ok(grid.minX <= -config.boundsCols * grid.cellSize * 0.5);
        assert.ok(grid.minY <= -config.boundsRows * grid.cellSize * 0.5);
    });
});
