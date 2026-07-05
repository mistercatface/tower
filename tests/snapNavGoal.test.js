import { snapNavGoalCellIndex, snapNavGoalWorld } from "../Libraries/Navigation/navigation.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import {  FLOOR_CELL_KIND  } from "../Libraries/Spatial/spatial.js";

describe("snapNavGoal", () => {
    it("snapNavGoalCellIndex moves belt target to entry neighbor", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        const cols = grid.cols;
        grid.writeFloorCell(2 + 2 * cols, FLOOR_CELL_KIND.Belt, 0);
        const snappedIdx = snapNavGoalCellIndex(grid, 0, 2 + 2 * cols);
        assert.equal(snappedIdx % cols, 1);
        assert.equal((snappedIdx / cols) | 0, 2);
    });
    it("snapNavGoalWorld matches cell snap at entry neighbor", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        const cols = grid.cols;
        grid.writeFloorCell(2 + 2 * cols, FLOOR_CELL_KIND.Belt, 0);
        const from = grid.gridToWorldByIdx(0);
        const target = grid.gridToWorldByIdx(2 + 2 * cols);
        const snappedWorld = snapNavGoalWorld(grid, from.x, from.y, target.x, target.y);
        const entryIdx = snapNavGoalCellIndex(grid, 0, 2 + 2 * cols);
        const entryWorld = grid.gridToWorldByIdx(entryIdx);
        assert.equal(snappedWorld.x, entryWorld.x);
        assert.equal(snappedWorld.y, entryWorld.y);
    });
    it("canStep requires worker topology", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        assert.equal(grid.isBlockedIdx(0), false);
        assert.equal(grid.canStep(0, 1), false);
    });
});
