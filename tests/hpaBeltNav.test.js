import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND, isEntityOnFloorBelt, isFloorBeltCell } from "../Libraries/Spatial/grid/FloorCell.js";
describe("floor belt on/off cell", () => {
    it("isEntityOnFloorBelt matches body center cell only", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const beltWorld = grid.gridToWorld(2, 2);
        const offWorld = grid.gridToWorld(0, 0);
        assert.equal(isFloorBeltCell(grid, 2, 2), true);
        assert.equal(isFloorBeltCell(grid, 0, 0), false);
        assert.equal(isEntityOnFloorBelt(grid, beltWorld.x, beltWorld.y), true);
        assert.equal(isEntityOnFloorBelt(grid, offWorld.x, offWorld.y), false);
    });
});
