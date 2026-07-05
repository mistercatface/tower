import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { createNavWalkableCandidateMask, isNavWalkableAt, writeNavWalkableFlags } from "../Libraries/Navigation/navigation.js";

describe("navWalkableIndex", () => {
    it("isNavWalkableAt uses dense cell indices", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 8 * 16, 8 * 16);
        const cols = grid.cols;
        const flags = new Uint8Array(cols * cols);
        writeNavWalkableFlags(flags, [
            worldIdxAtCell(grid, 1, 2),
            worldIdxAtCell(grid, 4, 5),
        ]);
        const index = { flags, cols, rows: cols };
        assert.equal(isNavWalkableAt(index, worldIdxAtCell(grid, 1, 2)), true);
        assert.equal(isNavWalkableAt(index, worldIdxAtCell(grid, 4, 5)), true);
        assert.equal(isNavWalkableAt(index, worldIdxAtCell(grid, 0, 0)), false);
    });

    it("createNavWalkableCandidateMask reuses buffers", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 4 * 16, 4 * 16);
        const reuse = new Uint8Array(16);
        reuse.fill(1);
        const mask = createNavWalkableCandidateMask(grid, [worldIdxAtCell(grid, 1, 1)], reuse);
        assert.equal(mask, reuse);
        assert.equal(mask[worldIdxAtCell(grid, 1, 1)], 1);
        assert.equal(mask[worldIdxAtCell(grid, 0, 0)], 0);
    });
});
