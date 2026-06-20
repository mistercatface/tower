import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { floorBeltFacingFromIndex, FLOOR_CELL_KIND } from "../Libraries/Spatial/grid/FloorCell.js";
import { snapNavGoalCell, snapNavGoalWorld } from "../Libraries/Navigation/snapNavGoal.js";
describe("snapNavGoal", () => {
    it("snapNavGoalCell moves belt target to entry neighbor", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const snapped = snapNavGoalCell(grid, 0, 0, 2, 2);
        assert.equal(snapped.col, 1);
        assert.equal(snapped.row, 2);
    });
    it("snapNavGoalWorld matches cell snap at entry neighbor", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(2, 2, FLOOR_CELL_KIND.Belt, floorBeltFacingFromIndex(0));
        const from = grid.gridToWorld(0, 0);
        const target = grid.gridToWorld(2, 2);
        const snappedWorld = snapNavGoalWorld(grid, from.x, from.y, target.x, target.y);
        const entryCell = snapNavGoalCell(grid, 0, 0, 2, 2);
        const entryWorld = grid.gridToWorld(entryCell.col, entryCell.row);
        assert.equal(snappedWorld.x, entryWorld.x);
        assert.equal(snappedWorld.y, entryWorld.y);
    });
    it("canStep requires worker topology", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        assert.equal(grid.isBlocked(0, 0), false);
        assert.equal(grid.canStep(0, 0, 1, 0), false);
    });
});
