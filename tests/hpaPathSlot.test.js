import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { createGridNavContext, syncGridNavContext } from "../Libraries/Navigation/GridNavContext.js";
import { findSabPathProgressIdx, computeSabPathSteering } from "../Libraries/Pathfinding/hpaPathSlot.js";

function createGridWithNav() {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
    const gridNavContext = createGridNavContext(grid);
    syncGridNavContext(gridNavContext, grid);
    return { grid, gridNavContext };
}

function mockWorker(path) {
    return {
        pathCol(_slot, i) {
            return path[i].col;
        },
        pathRow(_slot, i) {
            return path[i].row;
        },
    };
}

describe("hpaPathSlot", () => {
    it("findSabPathProgressIdx uses gridNavContext for waypoint canStep checks", () => {
        const { grid, gridNavContext } = createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
        ];
        const worker = mockWorker(path);
        const start = grid.gridToWorld(4, 4);
        const idx = findSabPathProgressIdx(start.x, start.y, worker, 0, path.length, grid, gridNavContext);
        assert.ok(idx >= 1);
    });

    it("computeSabPathSteering advances with gridNavContext", () => {
        const { grid, gridNavContext } = createGridWithNav();
        const path = [
            { col: 4, row: 4 },
            { col: 5, row: 4 },
            { col: 6, row: 4 },
        ];
        const worker = mockWorker(path);
        const start = grid.gridToWorld(4, 4);
        const target = grid.gridToWorld(6, 4);
        const steering = computeSabPathSteering({ x: start.x, y: start.y }, worker, 0, path.length, target.x, target.y, grid, gridNavContext, {
            pathWaypointArrival: 16,
            arrivalDistance: 8,
            pathOffPathDistance: 48,
        });
        assert.ok(steering);
        assert.ok(Math.hypot(steering.desiredX, steering.desiredY) > 0);
    });
});
