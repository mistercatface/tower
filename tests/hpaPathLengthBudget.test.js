import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeNavTopologyLocal, FlatGridSearch, SearchState } from "../Libraries/Navigation/navigation.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

function openCorridorGrid(cols, rows) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return grid;
}

describe("hpa path length budget", () => {
    it("local replan reaches goal past old 96-cell cap within legMaxCost budget", () => {
        const cols = 120;
        const rows = 5;
        const grid = openCorridorGrid(cols, rows);
        const { topology } = bakeNavTopologyLocal(grid);
        const startIdx = 1 * cols + 1;
        const targetIdx = 1 * cols + (cols - 2);
        
        const search = new FlatGridSearch(new SearchState(cols * rows));
        search.neighbors = topology.octileNeighbors;
        search.cols = cols;
        const scratch = new Int32Array(cols * rows);
        
        const len = search.localPortal(startIdx, targetIdx, cols * rows * 15, scratch, topology.blocked, null, 0);
        assert.ok(len > 96, `expected path longer than old cap, got len=${len}`);
        assert.equal(scratch[len - 1], targetIdx);
    });
});
