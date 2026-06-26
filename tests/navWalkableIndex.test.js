import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { createNavWalkableCandidateMask, readNavWalkableFlag, writeNavWalkableFlags } from "../Libraries/Procedural/Mazes/navWalkableIndex.js";

describe("navWalkableIndex", () => {
    it("readNavWalkableFlag uses dense cell indices", () => {
        const cols = 8;
        const flags = new Uint8Array(cols * cols);
        writeNavWalkableFlags(flags, cols, [
            { col: 1, row: 2 },
            { col: 4, row: 5 },
        ]);
        assert.equal(readNavWalkableFlag(flags, cols, 1, 2), true);
        assert.equal(readNavWalkableFlag(flags, cols, 4, 5), true);
        assert.equal(readNavWalkableFlag(flags, cols, 0, 0), false);
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
