import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeNavCachesInto, createGridNavContext, createTestNavigation, syncGridNavContext } from "../Libraries/Navigation/GridNavContext.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

describe("grid nav context", () => {
    it("createTestNavigation syncs context on onObstaclesChanged", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const navigation = createTestNavigation(grid);
        const revision0 = navigation.gridNavContext.wallRevision;
        grid.grid[colRowToIndex(8, 8, grid.cols)] = 1;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await navigation.onObstaclesChanged({ startCol: 7, endCol: 9, startRow: 7, endRow: 9 });
        assert.ok(navigation.gridNavContext.wallRevision > revision0);
        assert.equal(navigation.obstacleGeneration, 1);
    });

    it("bakeNavCachesInto matches syncGridNavContext for the same grid revision", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        grid.grid[colRowToIndex(10, 8, grid.cols)] = 1;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        const context = createGridNavContext(grid);
        syncGridNavContext(context, grid);
        const arenaCardinal = new Uint8Array(grid.cols * grid.rows);
        const arenaVertex = new Uint8Array((grid.cols + 1) * (grid.rows + 1));
        bakeNavCachesInto(grid, arenaCardinal, arenaVertex);
        assert.deepEqual(Array.from(arenaCardinal), Array.from(context.navCardinalOpen));
        assert.deepEqual(Array.from(arenaVertex), Array.from(context.vertexPassability));
    });
});
