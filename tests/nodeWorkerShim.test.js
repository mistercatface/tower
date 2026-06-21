import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkerNavigation, terminateWorkerNavigation, NavTopology } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { HPA_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
describe("node worker shim", () => {
    it("runs HpaPathWorker nav topology sync", async () => {
        assert.equal(typeof Worker, "function");
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const hpa = new HpaPathWorker(HPA_WORKER_URL, grid);
        const topology = NavTopology.bindWorker(grid, hpa);
        hpa.setTopologySyncTarget(topology);
        await hpa.scheduleNavTopologySyncAwait(grid, null);
        assert.ok(hpa.getNavArena());
        assert.ok(topology.isReady());
        assert.ok(topology.topology);
        assert.ok(topology.frame);
        hpa.shutdown();
        await hpa.host.worker.terminate();
    });
    it("keeps posting to the active worker after recycle", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 512, 512);
        const hpa = new HpaPathWorker(HPA_WORKER_URL, grid);
        const topology = NavTopology.bindWorker(grid, hpa);
        hpa.setTopologySyncTarget(topology);
        await hpa.scheduleNavTopologySyncAwait(grid, null);
        hpa._recycleWorkerThread();
        await hpa.scheduleNavTopologySyncAwait(grid, null);
        assert.ok(topology.isReady());
        assert.ok(topology.topology);
        hpa.shutdown();
        await hpa.host.worker.terminate();
    });
    it("createWorkerNavigation wires NavRuntime to worker", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        const navigation = await createWorkerNavigation(grid);
        assert.ok(navigation.topology.isReady());
        assert.ok(navigation.topology.topology);
        await terminateWorkerNavigation(navigation);
    });
});
