import { findSabPathProgressIdx, computeSabPathSteering } from "../Libraries/Navigation/navigation.js";
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";

async function createGridWithNav() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const navigation = await createWorkerNavigation(grid);
    return { grid, navTopology: navigation.topology, navigation };
}
function mockWorker(path, grid) {
    return {
        pathIdx(_slot, i) {
            return worldIdxAtCell(grid, path[i].col, path[i].row);
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
        const start = grid.gridToWorldByIdx(4 + 4 * grid.cols);
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
        const start = grid.gridToWorldByIdx(4 + 4 * grid.cols);
        const target = grid.gridToWorldByIdx(6 + 4 * grid.cols);
        const steering = computeSabPathSteering({ x: start.x, y: start.y }, worker, 0, path.length, target.x, target.y, grid, navTopology, {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
        });
        assert.ok(steering);
        assert.ok(Math.hypot(steering.desiredX, steering.desiredY) > 0);
        terminateWorkerNavigation(navigation);
    });
    it("computeSabPathSteering slows down for sharp corners and arrival", async () => {
        const { grid, navTopology, navigation } = await createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
            { col: 5, row: 5 },
        ];
        const worker = mockWorker(path, grid);
        const start = grid.gridToWorldByIdx(4 + 4 * grid.cols);
        const corner = grid.gridToWorldByIdx(5 + 4 * grid.cols);
        const target = grid.gridToWorldByIdx(5 + 5 * grid.cols);

        // Max speed 100, accel 200
        const settings = {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
            maxSpeed: 100,
            accel: 200,
        };

        // When starting at (4, 4), which is 16 pixels from corner (5, 4)
        const steeringCorner = computeSabPathSteering(
            { x: start.x, y: start.y },
            worker,
            0,
            path.length,
            target.x,
            target.y,
            grid,
            navTopology,
            settings
        );
        
        assert.ok(steeringCorner.desiredSpeed < 100, `Expected slowdown near corner, got ${steeringCorner.desiredSpeed}`);

        // When close to target (5, 5) - e.g. at (5, 4.8), 3.2 pixels away
        const nearTarget = { x: target.x, y: target.y - 3.2 };
        const steeringArrival = computeSabPathSteering(
            nearTarget,
            worker,
            0,
            path.length,
            target.x,
            target.y,
            grid,
            navTopology,
            settings
        );

        assert.ok(steeringArrival.desiredSpeed < 50, `Expected arrival slowdown, got ${steeringArrival.desiredSpeed}`);
        
        terminateWorkerNavigation(navigation);
    });
});
