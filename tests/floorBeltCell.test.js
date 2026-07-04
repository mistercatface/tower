import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { FLOOR_CELL_KIND, FloorBelt } from "../Libraries/Spatial/grid/FloorCell.js";

describe("floor belt on/off cell", () => {
    it("isEntityOnFloorBelt matches body center cell only", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(2 + 2 * grid.cols, FLOOR_CELL_KIND.Belt, 0);
        const beltWorld = grid.gridToWorldByIdx(2 + 2 * grid.cols);
        const offWorld = grid.gridToWorldByIdx(0);
        assert.equal(FloorBelt.isBeltAtIdx(grid, 2 + 2 * grid.cols), true);
        assert.equal(FloorBelt.isBeltAtIdx(grid, 0), false);
        assert.equal(FloorBelt.isEntityOnBelt(grid, beltWorld.x, beltWorld.y), true);
        assert.equal(FloorBelt.isEntityOnBelt(grid, offWorld.x, offWorld.y), false);
    });
});
