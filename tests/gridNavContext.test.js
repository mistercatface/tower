import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestNavigation, terminateTestNavigation } from "./harness/workerNavigationHarness.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("grid nav context", () => {
    it("createTestNavigation syncs worker arena on onObstaclesChanged", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const navigation = await createTestNavigation(grid);
        const revision0 = navigation.gridNavContext.wallRevision;
        grid.grid[colRowToIndex(8, 8, grid.cols)] = 1;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await navigation.onObstaclesChanged({ startCol: 7, endCol: 9, startRow: 7, endRow: 9 });
        assert.ok(navigation.gridNavContext.wallRevision > revision0);
        assert.equal(navigation.obstacleGeneration, 1);
        assert.ok(grid.navTopology);
        terminateTestNavigation(navigation);
    });
});
