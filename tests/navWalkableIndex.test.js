import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createNavWalkableCandidateMask, isNavWalkableAt, writeNavWalkableFlags } from "../Libraries/Procedural/Mazes/navWalkableIndex.js";

describe("navWalkableIndex", () => {
    it("isNavWalkableAt uses dense cell indices", () => {
        const cols = 8;
        const flags = new Uint8Array(cols * cols);
        writeNavWalkableFlags(flags, cols, [
            { col: 1, row: 2 },
            { col: 4, row: 5 },
        ]);
        const index = { flags, cols, rows: cols };
        assert.equal(isNavWalkableAt(index, colRowToIndex(1, 2, cols)), true);
        assert.equal(isNavWalkableAt(index, colRowToIndex(4, 5, cols)), true);
        assert.equal(isNavWalkableAt(index, colRowToIndex(0, 0, cols)), false);
    });

    it("createNavWalkableCandidateMask reuses buffers", () => {
        const grid = { cols: 4, rows: 4 };
        const reuse = new Uint8Array(16);
        reuse.fill(1);
        const mask = createNavWalkableCandidateMask(grid, [{ col: 1, row: 1 }], reuse);
        assert.equal(mask, reuse);
        assert.equal(mask[colRowToIndex(1, 1, 4)], 1);
        assert.equal(mask[colRowToIndex(0, 0, 4)], 0);
    });
});
