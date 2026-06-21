import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("nav topology sync", () => {
    it("createWorkerNavigation syncs worker arena on commitEdit", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const nav = await createWorkerNavigation(grid);
        const revision0 = nav.topology.wallRevision;
        grid.grid[colRowToIndex(8, 8, grid.cols)] = 1;
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        await nav.commitEdit({ startCol: 7, endCol: 9, startRow: 7, endRow: 9 });
        assert.ok(nav.topology.wallRevision > revision0);
        assert.equal(nav.syncedTopologyKey(), nav.topologyKey());
        assert.ok(nav.topology.isReady());
        assert.ok(nav.topology.topology);
        terminateWorkerNavigation(nav);
    });
});
