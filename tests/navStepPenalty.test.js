import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FlatGridSearch } from "../Libraries/Pathfinding/AStar.js";
import { SearchState } from "../Libraries/Pathfinding/SearchState.js";
import { createNavStepPenaltyLookup } from "../Libraries/Pathfinding/navStepPenalty.js";
import { packCellKey } from "../Libraries/DataStructures/CellKey.js";

describe("nav step penalty", () => {
    it("local A* routes around a heavily penalized cell", () => {
        const cols = 5;
        const rows = 3;
        const navGraph = { canStep: () => true };
        const searchState = new SearchState(cols * rows);
        const penalty = createNavStepPenaltyLookup(cols, [packCellKey(2, 1)], [100]);
        const search = new FlatGridSearch({ navGraph, cols, rows, searchState, stepPenaltyLookup: penalty });
        const outPath = new Int32Array(100);
        const len = search.local(0, 1, 4, 1, 96, outPath);
        assert.ok(len > 0);
        const path = [];
        for (let i = 0; i < len; i++) {
            path.push({ col: outPath[i] % cols, row: (outPath[i] / cols) | 0 });
        }
        assert.ok(!path.some((cell) => cell.col === 2 && cell.row === 1));
    });
});
