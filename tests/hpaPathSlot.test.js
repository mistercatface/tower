import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "../Libraries/Navigation/WorkerNavigationFactory.js";
import { findSabPathProgressIdx, computeSabPathSteering } from "../Libraries/Pathfinding/hpaPathSlot.js";
async function createGridWithNav() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const navigation = await createWorkerNavigation(grid);
    return { grid, navTopology: navigation.topology, navigation };
}
function mockWorker(path, grid) {
    return {
        pathIdx(_slot, i) {
            return grid.idx(path[i].col, path[i].row);
        },
    };
}
describe("hpaPathSlot", () => {
    it("findSabPathProgressIdx uses navTopology for waypoint canStep checks", async () => {
        const { grid, navTopology, navigation } = await createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
        ];
        const worker = mockWorker(path, grid);
        const start = grid.gridToWorld(4, 4);
        const idx = findSabPathProgressIdx(start.x, start.y, worker, 0, path.length, grid, navTopology);
        assert.ok(idx >= 1);
        terminateWorkerNavigation(navigation);
    });
    it("computeSabPathSteering advances with navTopology", async () => {
        const { grid, navTopology, navigation } = await createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
            { col: 6, row: 4 },
        ];
        const worker = mockWorker(path, grid);
        const start = grid.gridToWorld(4, 4);
        const target = grid.gridToWorld(6, 4);
        const steering = computeSabPathSteering({ x: start.x, y: start.y }, worker, 0, path.length, target.x, target.y, grid, navTopology, {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
        });
        assert.ok(steering);
        assert.ok(Math.hypot(steering.desiredX, steering.desiredY) > 0);
        terminateWorkerNavigation(navigation);
    });
});
