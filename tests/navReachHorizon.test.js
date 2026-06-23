import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, gridNavCacheKey } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { bakeNavTopologyLocal } from "../Libraries/Pathfinding/bakeNavTopology.js";
import { syncNavReachHorizon, navReachStepsTo } from "../Libraries/Navigation/navReachHorizon.js";
import { applySnakeGameConfig, getSnakeGameConfig } from "../Libraries/Game/snake/snakeGameConfig.js";

function openGrid(cols = 12, rows = 12) {
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, cols * 16, rows * 16);
    return grid;
}

function stampWall(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
    bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
}

function cellWorld(grid, col, row) {
    return grid.gridToWorld(col, row);
}

function bake(grid) {
    return bakeNavTopologyLocal(grid).navTopology;
}

describe("syncNavReachHorizon", () => {
    it("reports straight-line path steps on an open grid", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        assert.equal(syncNavReachHorizon(navTopology, start.x, start.y, 32), true);
        assert.equal(navReachStepsTo(cellWorld(grid, 5, 2).x, cellWorld(grid, 5, 2).y), 3);
        assert.equal(navReachStepsTo(cellWorld(grid, 2, 5).x, cellWorld(grid, 2, 5).y), 3);
    });

    it("returns null beyond maxSteps", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        assert.equal(syncNavReachHorizon(navTopology, start.x, start.y, 2), true);
        assert.equal(navReachStepsTo(target.x, target.y), null);
    });

    it("returns false when start cell is blocked", () => {
        const grid = openGrid();
        stampWall(grid, 2, 2);
        const navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        assert.equal(syncNavReachHorizon(navTopology, start.x, start.y, 32), false);
        assert.equal(navReachStepsTo(target.x, target.y), null);
    });

    it("walks around a wall with more steps than euclidean cells", () => {
        const grid = openGrid();
        let navTopology = bake(grid);
        stampWall(grid, 3, 2);
        navTopology = bake(grid);
        const start = cellWorld(grid, 2, 2);
        const target = cellWorld(grid, 5, 2);
        assert.equal(syncNavReachHorizon(navTopology, start.x, start.y, 32), true);
        const steps = navReachStepsTo(target.x, target.y);
        assert.ok(steps != null && steps > 3, `expected detour > 3, got ${steps}`);
    });

    it("invalidates nav cache key after grid edits", () => {
        const grid = openGrid();
        bake(grid);
        const keyBefore = gridNavCacheKey(grid);
        stampWall(grid, 3, 2);
        assert.notEqual(keyBefore, gridNavCacheKey(grid));
    });

    it("returns false when nav topology is not ready", () => {
        const grid = openGrid();
        const navTopology = bake(grid);
        navTopology.invalidateLocalBake();
        const start = cellWorld(grid, 2, 2);
        assert.equal(syncNavReachHorizon(navTopology, start.x, start.y, 32), false);
        assert.equal(navReachStepsTo(cellWorld(grid, 5, 2).x, cellWorld(grid, 5, 2).y), null);
    });
});

describe("snake reach config", () => {
    it("defaults decisionReachHorizon on game config", () => {
        applySnakeGameConfig();
        assert.equal(getSnakeGameConfig().decisionReachHorizon, 32);
    });
});
