import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeNavTopologyLocal, buildNavComponentMap, buildNavReachableMaskFromSeed } from "../Libraries/Navigation/navigation.js";
import { BeltPacked, WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";

describe("buildNavReachableMaskFromSeed", () => {
    it("dead-end belt seed does not mark upstream belt cells", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 12 * 16, 12 * 16);
        const straightEast = BeltPacked.defaultForSpawn("floor_belt");
        const westIdx = grid.idx(4, 4);
        const eastIdx = grid.idx(5, 4);
        grid.writeFloorCell(westIdx, straightEast);
        grid.writeFloorCell(eastIdx, straightEast);
        const block = (col, row) => {
            grid.grid[grid.idx(col, row)] = 1;
        };
        block(3, 4);
        block(6, 4);
        for (let col = 3; col <= 6; col++) {
            block(col, 3);
            block(col, 5);
        }

        const { topology } = bakeNavTopologyLocal(grid);
        const blocked = topology.blocked;
        const octileNeighbors = topology.octileNeighbors;
        const { cols, rows } = grid;

        const componentMap = buildNavComponentMap(blocked, octileNeighbors, cols, rows);
        assert.equal(componentMap[westIdx], componentMap[eastIdx], "component map merges belt chain");

        const fromDeadEnd = buildNavReachableMaskFromSeed(blocked, octileNeighbors, cols, rows, eastIdx);
        assert.equal(fromDeadEnd[eastIdx], 1);
        assert.equal(fromDeadEnd[westIdx], 0);

        const fromEntrance = buildNavReachableMaskFromSeed(blocked, octileNeighbors, cols, rows, westIdx);
        assert.equal(fromEntrance[westIdx], 1);
        assert.equal(fromEntrance[eastIdx], 1);
    });

    it("returns all zeros for invalid seed", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 8 * 16, 8 * 16);
        const { topology } = bakeNavTopologyLocal(grid);
        const mask = buildNavReachableMaskFromSeed(topology.blocked, topology.octileNeighbors, grid.cols, grid.rows, -1);
        assert.equal(mask.some((v) => v !== 0), false);
    });
});
