import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import {  BeltPacked, FloorBelt  } from "../Libraries/Spatial/belts.js";

describe("floor belt on/off cell", () => {
    it("isEntityOnFloorBelt matches body center cell only", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(64, 64, 128, 128);
        grid.writeFloorCell(2 + 2 * grid.cols, BeltPacked.defaultForSpawn("floor_belt"));
        const beltIdx = 2 + 2 * grid.cols;
        const beltX = grid.gridCenterXByIdx(beltIdx);
        const beltY = grid.gridCenterYByIdx(beltIdx);
        const offX = grid.gridCenterXByIdx(0);
        const offY = grid.gridCenterYByIdx(0);
        assert.equal(FloorBelt.isBeltAtIdx(grid, beltIdx), true);
        assert.equal(FloorBelt.isBeltAtIdx(grid, 0), false);
        assert.equal(FloorBelt.isEntityOnBelt(grid, beltX, beltY), true);
        assert.equal(FloorBelt.isEntityOnBelt(grid, offX, offY), false);
    });
});
