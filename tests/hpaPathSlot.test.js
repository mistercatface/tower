import { findSabPathProgressIdx, computeSabPathSteering } from "../Libraries/Navigation/navigation.js";
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { mockHpaPathWorker } from "./harness/hpaPathSlotHarness.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";

async function createGridWithNav() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const navigation = await createWorkerNavigation(grid);
    return { grid, navTopology: navigation.topology, navigation };
}

describe("hpaPathSlot", () => {
    it("findSabPathProgressIdx uses navTopology for waypoint canStep checks", async () => {
        const { grid, navTopology, navigation } = await createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
        ];
        const worker = mockHpaPathWorker(path, grid);
        const startIdx = 4 + 4 * grid.cols;
        const startX = grid.gridCenterXByIdx(startIdx);
        const startY = grid.gridCenterYByIdx(startIdx);
        const idx = findSabPathProgressIdx(startX, startY, worker, 0, path.length, grid, navTopology);
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
        const worker = mockHpaPathWorker(path, grid);
        const startIdx = 4 + 4 * grid.cols;
        const targetIdx = 6 + 4 * grid.cols;
        const startX = grid.gridCenterXByIdx(startIdx);
        const startY = grid.gridCenterYByIdx(startIdx);
        const targetX = grid.gridCenterXByIdx(targetIdx);
        const targetY = grid.gridCenterYByIdx(targetIdx);
        const steering = computeSabPathSteering({ x: startX, y: startY }, worker, 0, path.length, targetX, targetY, grid, navTopology, {
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
        const worker = mockHpaPathWorker(path, grid);
        const startIdx = 4 + 4 * grid.cols;
        const targetIdx = 5 + 5 * grid.cols;
        const startX = grid.gridCenterXByIdx(startIdx);
        const startY = grid.gridCenterYByIdx(startIdx);
        const targetX = grid.gridCenterXByIdx(targetIdx);
        const targetY = grid.gridCenterYByIdx(targetIdx);

        const settings = {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
            maxSpeed: 100,
            accel: 200,
        };

        const steeringCorner = computeSabPathSteering(
            { x: startX, y: startY },
            worker,
            0,
            path.length,
            targetX,
            targetY,
            grid,
            navTopology,
            settings
        );
        
        assert.ok(steeringCorner.desiredSpeed < 100, `Expected slowdown near corner, got ${steeringCorner.desiredSpeed}`);

        const nearTarget = { x: targetX, y: targetY - 3.2 };
        const steeringArrival = computeSabPathSteering(
            nearTarget,
            worker,
            0,
            path.length,
            targetX,
            targetY,
            grid,
            navTopology,
            settings
        );

        assert.ok(steeringArrival.desiredSpeed < 50, `Expected arrival slowdown, got ${steeringArrival.desiredSpeed}`);
        
        terminateWorkerNavigation(navigation);
    });
});
