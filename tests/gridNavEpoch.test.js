import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    WorldObstacleGrid,
    GRID_NAV_EPOCH_WALL,
    GRID_NAV_EPOCH_FLOOR,
    bumpGridNavEpoch,
    gridNavCacheKey,
    isNavTopologyReady,
} from "../Libraries/Spatial/spatial.js";

describe("gridNavEpoch invalidation spine", () => {
    it("gridNavCacheKey folds all bump channels", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const key0 = gridNavCacheKey(grid);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
        assert.notEqual(gridNavCacheKey(grid), key0);
        const key1 = gridNavCacheKey(grid);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH_FLOOR);
        assert.notEqual(gridNavCacheKey(grid), key1);
    });
    it("isNavTopologyReady is the sole readiness check", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const key = gridNavCacheKey(grid);
        const worker = { _navSyncPromise: null, _syncedNavCacheKey: key };
        assert.equal(isNavTopologyReady(worker, grid), true);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH_WALL);
        assert.equal(isNavTopologyReady(worker, grid), false);
        worker._syncedNavCacheKey = gridNavCacheKey(grid);
        assert.equal(isNavTopologyReady(worker, grid), true);
        worker._navSyncPromise = Promise.resolve();
        assert.equal(isNavTopologyReady(worker, grid), false);
    });
});
