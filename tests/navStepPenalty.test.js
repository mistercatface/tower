import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runLocalAStarFlat } from "../Libraries/Pathfinding/AStar.js";
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
        const path = runLocalAStarFlat(0, 1, 4, 1, navGraph, cols, rows, 96, searchState.prepare(), penalty);
        assert.ok(path);
        assert.ok(!path.some((cell) => cell.col === 2 && cell.row === 1));
    });
});
