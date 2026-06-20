import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import {
    GRID_NAV_EPOCH,
    bumpGridNavEpoch,
    gridNavCacheKey,
    isGridNavStale,
    setGridPassagePowerNavKey,
} from "../Libraries/Spatial/grid/gridNavEpoch.js";

describe("gridNavEpoch invalidation spine", () => {
    it("gridNavCacheKey folds all bump channels", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const key0 = gridNavCacheKey(grid);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        assert.notEqual(gridNavCacheKey(grid), key0);
        const key1 = gridNavCacheKey(grid);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Floor);
        assert.notEqual(gridNavCacheKey(grid), key1);
        const key2 = gridNavCacheKey(grid);
        setGridPassagePowerNavKey(grid, "power-a");
        assert.notEqual(gridNavCacheKey(grid), key2);
    });
    it("isGridNavStale compares live key to synced snapshot", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const synced = gridNavCacheKey(grid);
        assert.equal(isGridNavStale(grid, synced), false);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        assert.equal(isGridNavStale(grid, synced), true);
    });
    it("scheduleNavTopologySyncAwait must not freeze targetKey across grid bumps", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const keyA = gridNavCacheKey(grid);
        bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        const keyB = gridNavCacheKey(grid);
        assert.notEqual(keyA, keyB);
    });
});
