import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { BeltPacked } from "../Libraries/Spatial/belts.js";
import { bakeNavTopologyLocal, buildFullRegionGraph, createNavLocalView } from "../Libraries/Navigation/navigation.js";

function layHorizontalBeltRun(grid, row, startCol, length) {
    const cols = grid.cols;
    const beltIndices = [];
    for (let col = startCol; col < startCol + length; col++) {
        const idx = row * cols + col;
        grid.writeFloorCell(idx, BeltPacked.defaultForSpawn("floor_belt"));
        beltIndices.push(idx);
    }
    return beltIndices;
}

describe("belt region grouping", () => {
    it("groups adjacent belt cells into one region when floorPacked is threaded", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const row = 4;
        const beltIndices = layHorizontalBeltRun(grid, row, 2, 5);
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const navGraph = createNavLocalView(frame, topology);
        const built = buildFullRegionGraph({
            blocked: topology.blocked,
            frame,
            navGraph,
            maxCellsPerChunk: 16,
            minCellsPerChunk: 0,
            floorPacked: grid.floorPacked,
        });
        const regionId = built.graph.cellToNode[beltIndices[0]];
        assert.ok(regionId >= 0, "first belt cell must belong to a region");
        for (let i = 1; i < beltIndices.length; i++) {
            assert.equal(built.graph.cellToNode[beltIndices[i]], regionId, `belt cell ${i} should share region with belt run`);
        }
    });

    it("fragments belt cells without floorPacked on the graph build path", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 160, 160);
        const row = 4;
        const beltIndices = layHorizontalBeltRun(grid, row, 2, 5);
        const { frame, topology } = bakeNavTopologyLocal(grid);
        const navGraph = createNavLocalView(frame, topology);
        const built = buildFullRegionGraph({
            blocked: topology.blocked,
            frame,
            navGraph,
            maxCellsPerChunk: 16,
            minCellsPerChunk: 0,
        });
        const regionIds = new Set(beltIndices.map((idx) => built.graph.cellToNode[idx]));
        assert.ok(regionIds.size > 1, "without floorPacked, one-directional belt steps should fragment regions");
    });
});
