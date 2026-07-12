import { findSabPathProgressIdx, computeSabPathSteering } from "../Libraries/Navigation/navigation.js";
import "./nodeCanvasSetup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/spatial.js";
import { mockHpaPathWorker } from "./harness/hpaPathSlotHarness.js";
import { createWorkerNavigation, terminateWorkerNavigation } from "./WorkerNavigationFactory.js";
import { entityX, entityY, entityR, entityVx, entityVy } from "../Core/engineMemory.js";

const EID = 0;

function seedSteerPose(x, y, radius = 8) {
    entityX[EID] = x;
    entityY[EID] = y;
    entityR[EID] = radius;
    entityVx[EID] = 0;
    entityVy[EID] = 0;
}

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
        seedSteerPose(startX, startY);
        const steering = new Float32Array(3);
        const offPath = computeSabPathSteering(steering, 0, EID, worker, 0, path.length, targetX, targetY, grid, navTopology, {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
        });
        assert.equal(offPath, false);
        assert.ok(Math.hypot(steering[0], steering[1]) > 0);
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

        seedSteerPose(startX, startY);
        const steeringCorner = new Float32Array(3);
        computeSabPathSteering(
            steeringCorner,
            0,
            EID,
            worker,
            0,
            path.length,
            targetX,
            targetY,
            grid,
            navTopology,
            settings
        );

        assert.ok(steeringCorner[2] < 100, `Expected slowdown near corner, got ${steeringCorner[2]}`);

        seedSteerPose(targetX, targetY - 3.2);
        const steeringArrival = new Float32Array(3);
        computeSabPathSteering(
            steeringArrival,
            0,
            EID,
            worker,
            0,
            path.length,
            targetX,
            targetY,
            grid,
            navTopology,
            settings
        );

        assert.ok(steeringArrival[2] < 50, `Expected arrival slowdown, got ${steeringArrival[2]}`);

        terminateWorkerNavigation(navigation);
    });
});
