import assert from "node:assert/strict";
import { describe, it } from "node:test";
globalThis.self = globalThis;
import { bakeNavTopologyLocal, FlatGridSearch, prepareHpaReplanPrep, SearchState } from "../Libraries/Navigation/navigation.js";
import { growHpaPathIdxSab, stitchAbstractCellPath } from "../Libraries/Pathfinding/hpaWorkerSab.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

function openCorridorGrid(cols, rows) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return grid;
}

describe("hpa path length budget", () => {
    it("local replan reaches goal past old 96-cell cap when legMaxCost includes belt headroom", () => {
        const cols = 120;
        const rows = 5;
        const grid = openCorridorGrid(cols, rows);
        const { topology } = bakeNavTopologyLocal(grid);
        const cellToRegion = new Int16Array(cols * rows).fill(0);
        const startIdx = 1 * cols + 1;
        const targetIdx = 1 * cols + (cols - 2);
        const prep = prepareHpaReplanPrep(cols, rows, cellToRegion, { nodeCount: 1, nodeIds: ["a"], nodeIdx: [0] }, startIdx, targetIdx);
        assert.equal(prep.mode, "local");
        assert.equal(prep.legMaxCost, (cols + rows) * 21);
        const search = new FlatGridSearch(new SearchState(cols * rows));
        search.neighbors = topology.octileNeighbors;
        search.cols = cols;
        const scratch = new Int32Array(cols * rows);
        const len = search.local(startIdx, targetIdx, prep.legMaxCost, scratch);
        assert.ok(len > 96, `expected path longer than old cap, got len=${len}`);
        assert.equal(scratch[len - 1], targetIdx);
    });

    it("legMaxCost belt headroom covers penalized belt corridors that exceed cols + rows g-score", async () => {
        const { createNavStepPenaltyLookup } = await import("../Libraries/Workers/Navigation/HpaWorkerEntry.js");
        const { BeltPacked } = await import("../Libraries/Spatial/belts.js");
        const cols = 80;
        const rows = 3;
        const grid = openCorridorGrid(cols, rows);
        const row = 1;
        const floorPacked = grid.floorPacked;
        const keys = [];
        const costs = [];
        for (let col = 2; col < cols - 2; col++) {
            const idx = col + row * cols;
            floorPacked[idx] = BeltPacked.defaultForSpawn("floor_belt");
            keys.push(idx);
            costs.push(5);
        }
        const block = (col, r) => {
            grid.grid[grid.idx(col, r)] = 1;
        };
        for (let col = 0; col < cols; col++) {
            block(col, 0);
            block(col, 2);
        }
        block(0, 1);
        block(cols - 1, 1);
        const { topology } = bakeNavTopologyLocal(grid);
        const cellToRegion = new Int16Array(cols * rows).fill(0);
        const startIdx = 1 + row * cols;
        const targetIdx = (cols - 2) + row * cols;
        const prep = prepareHpaReplanPrep(cols, rows, cellToRegion, { nodeCount: 1, nodeIds: ["a"], nodeIdx: [0] }, startIdx, targetIdx);
        const penalty = createNavStepPenaltyLookup(cols, keys, costs, floorPacked);
        const search = new FlatGridSearch(new SearchState(cols * rows));
        search.neighbors = topology.octileNeighbors;
        search.cols = cols;
        search.stepPenaltyLookup = penalty;
        const scratch = new Int32Array(cols * rows);
        const tightBudget = cols + rows;
        assert.equal(search.local(startIdx, targetIdx, tightBudget, scratch), 0, "cols+rows g-score budget should fail on penalized belt corridor");
        const len = search.local(startIdx, targetIdx, prep.legMaxCost, scratch);
        assert.ok(len > 0, "(cols+rows)*21 g-score budget should reach belt corridor goal");
        assert.equal(scratch[len - 1], targetIdx);
    });

    it("stitchAbstractCellPath returns 0 when a leg cannot be resolved", () => {
        const prep = { nodeCount: 2, startIdx: 5, targetIdx: 99, nodeIdx: [10, 20] };
        const abstractIdx = [0, 1, 2];
        const tempLegsBuffer = new Int32Array(16);
        const outIdx = new Int32Array(16);
        const resolveRegionLeg = () => 0;
        resolveRegionLeg.scratch = new Int32Array(8);
        const len = stitchAbstractCellPath(abstractIdx, prep, tempLegsBuffer, new Map(), new Map(), resolveRegionLeg, outIdx, 16);
        assert.equal(len, 0);
    });

    it("stitchAbstractCellPath returns 0 when stitched path exceeds maxPathLen", () => {
        const prep = { nodeCount: 0, startIdx: 0, targetIdx: 3, nodeIdx: [] };
        const legKey = (0 << 16) | 1;
        const tempLegsBuffer = new Int32Array([0, 1, 2, 3]);
        const tempLegsOffsets = new Map([[legKey, 0]]);
        const tempLegsLengths = new Map([[legKey, 4]]);
        const outIdx = new Int32Array(8);
        const resolveRegionLeg = () => 0;
        resolveRegionLeg.scratch = new Int32Array(8);
        const len = stitchAbstractCellPath([0, 1], prep, tempLegsBuffer, tempLegsOffsets, tempLegsLengths, resolveRegionLeg, outIdx, 2);
        assert.equal(len, 0);
    });

    it("growHpaPathIdxSab reallocates when stitched max grows", () => {
        const maxSlots = 4;
        let sab = growHpaPathIdxSab(new SharedArrayBuffer(4), maxSlots, 512);
        assert.equal(sab.byteLength, maxSlots * 512 * 4);
        const grown = growHpaPathIdxSab(sab, maxSlots, 2000);
        assert.ok(grown.byteLength >= maxSlots * 2000 * 4);
        assert.equal(growHpaPathIdxSab(grown, maxSlots, 2000), grown);
    });
});
