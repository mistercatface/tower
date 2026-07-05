import assert from "node:assert/strict";
import { describe, it } from "node:test";
globalThis.self = globalThis;
describe("nav step penalty", () => {
    it("local A* routes around a heavily penalized cell", async () => {
        const { FlatGridSearch, SearchState, FlatGridView } = await import("../Libraries/Navigation/navigation.js");
        const { createNavStepPenaltyLookup } = await import("../Libraries/Workers/Navigation/HpaWorkerEntry.js");
        const { packCellKey } = await import("../Libraries/DataStructures/CellKey.js");

        const cols = 5;
        const rows = 3;
        const navGraph = { canStep: () => true };
        const searchState = new SearchState(cols * rows);
        const penalty = createNavStepPenaltyLookup(cols, [2 + 1 * cols], [100]);
        const gridView = new FlatGridView(cols, rows, { blocked: null, canStep: () => true });
        const search = new FlatGridSearch(searchState, penalty);
        search.grid = gridView;
        search.gridIdx = gridView.gridIdx;
        const outPath = new Int32Array(100);
        const startIdx = 0 + 1 * cols;
        const targetIdx = 4 + 1 * cols;
        const len = search.local(startIdx, targetIdx, 96, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        assert.ok(!path.some((cell) => cell.col === 2 && cell.row === 1));
    });
    it("conveyor step penalty checks transition directions", async () => {
        const { createNavStepPenaltyLookup } = await import("../Libraries/Workers/Navigation/HpaWorkerEntry.js");
        const cols = 5;
        const rows = 3;
        const floorKind = new Uint8Array(cols * rows);
        const floorFacing = new Uint8Array(cols * rows);
        const beltIdx = 2 + 1 * cols;
        floorKind[beltIdx] = 1; // FLOOR_CELL_KIND.Belt
        floorFacing[beltIdx] = 0; // East (exit East, entry West)
        const penalty = createNavStepPenaltyLookup(cols, [], [], floorKind, floorFacing);
        const eastCost = penalty.extraCost(beltIdx, 1 + 1 * cols);
        assert.equal(eastCost, 0, "Stepping with flow of conveyor should be 0");
        const westCost = penalty.extraCost(beltIdx, 3 + 1 * cols);
        assert.equal(westCost, 20, "Stepping against flow of conveyor should be penalized");
    });
});
