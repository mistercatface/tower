import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkerNavigation, terminateWorkerNavigation, NavTopology } from "./WorkerNavigationFactory.js";
import { HPA_WORKER_URL } from "../Render/WorldSurfaceBootstrap.js";
import { HpaPathWorker } from "../Libraries/Pathfinding/HpaPathWorker.js";
import { buildReplanParams } from "../Libraries/Pathfinding/hpaReplan.js";
import { createNavState } from "../Libraries/Pathfinding/navSession.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { colRowToIndex } from "./harness/testGridUtils.js";

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
        await terminateWorkerNavigation(nav);
    });
    it("runs a real worker HPA replan request and recovers after worker recycle", async () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        const navigation = await createWorkerNavigation(grid);
        const start = grid.gridToWorldByIdx(colRowToIndex(2, 2, grid.cols));
        const target = grid.gridToWorldByIdx(colRowToIndex(10, 10, grid.cols));
        const request = buildReplanParams(grid, start.x, start.y, target.x, target.y, navigation, null);

        const navState1 = createNavState();
        const workerOut1 = await navigation.worker.requestPath(request, navState1);
        assert.ok(workerOut1?.result?.pathLen > 0);
        navigation.worker.releaseSlot(workerOut1.result.pathSlot);

        // Recycle the worker to simulate timeout/crash
        navigation.worker.recycleWorker();

        // Next request should trigger self-healing and succeed
        const navState2 = createNavState();
        const workerOut2 = await navigation.worker.requestPath(request, navState2);
        assert.ok(workerOut2?.result?.pathLen > 0);
        navigation.worker.releaseSlot(workerOut2.result.pathSlot);

        await terminateWorkerNavigation(navigation);
    });
});
