import assert from "node:assert/strict";
import { describe, it } from "node:test";
globalThis.self = globalThis;
describe("nav step penalty", () => {
    it("local A* routes around a heavily penalized cell", async () => {
        const { FlatGridSearch, SearchState, FlatGridView } = await import("../Libraries/Pathfinding/AStar.js");
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
});
