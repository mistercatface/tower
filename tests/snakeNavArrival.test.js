import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { snakeHasArrivedAtDestCell } from "../Libraries/Game/snake/snakeNavArrival.js";

describe("snakeHasArrivedAtDestCell", () => {
    it("requires standing on a belt destination cell, not the entry mouth", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(5, 5, FLOOR_CELL_KIND.BeltRails, floorBeltFacingFromIndex(0));
        assert.equal(snakeHasArrivedAtDestCell(grid, 4, 5, 5, 5), false);
        assert.equal(snakeHasArrivedAtDestCell(grid, 5, 5, 5, 5), true);
    });

    it("still allows Chebyshev 1 arrival for normal floor cells", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        assert.equal(snakeHasArrivedAtDestCell(grid, 4, 5, 5, 5), true);
        assert.equal(snakeHasArrivedAtDestCell(grid, 6, 7, 5, 5), false);
    });
});
