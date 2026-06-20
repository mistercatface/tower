import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { HPA_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("node worker shim", () => {
    it("runs HpaPathWorker nav topology sync", async () => {
        assert.equal(typeof Worker, "function");
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const hpa = new HpaPathWorker(HPA_WORKER_URL, grid);
        await hpa.scheduleNavTopologySyncAwait(grid, null);
        assert.ok(hpa.getNavArena());
        assert.ok(grid.navTopology);
        assert.ok(grid.navGridFrame);
        hpa.shutdown();
        await hpa.host.worker.terminate();
    });
    it("createWorkerNavigation wires NavigationService to worker", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        const navigation = await createWorkerNavigation(grid);
        assert.ok(navigation.gridNavContext.navCardinalOpen?.buffer instanceof SharedArrayBuffer);
        assert.ok(grid.navTopology);
        await terminateWorkerNavigation(navigation);
    });
});
