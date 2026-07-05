import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { colRowToIndex } from "./harness/testGridUtils.js";
import {  SpatialFrameCore  } from "../Libraries/Spatial/spatial.js";
import { 
    commitWallCandidateBucket,
    createWallCandidateBucketSlab,
    invalidateWallCandidateBucketFrame,
    lookupWallCandidateBucket,
    resetWallCandidateBucketSlab,
    wallBucketKeyParts,
 } from "../Libraries/Spatial/spatial.js";
import { mockKineticCircle } from "./harness/kineticTickHarness.js";

function stampBlockedCell(grid, col, row) {
    grid.grid[colRowToIndex(col, row, grid.cols)] = 1;
}

describe("wall candidate bucket slab", () => {
    it("reuses segment arrays on miss instead of allocating fresh buckets", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookupWallCandidateBucket(slab, 1, 2, 10, 0);
        first.segments.push("wall");
        commitWallCandidateBucket(slab, first.slot, 1, 2, 10, 0, first.segments);
        const stale = lookupWallCandidateBucket(slab, 1, 2, 11, 0);
        assert.equal(stale.hit, false);
        assert.equal(stale.segments, first.segments);
        assert.equal(stale.segments.length, 0);
    });
    it("hits same bucket within a frame and revision", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookupWallCandidateBucket(slab, 100, 3, 7, 2);
        first.segments.push("wall");
        commitWallCandidateBucket(slab, first.slot, 100, 3, 7, 2, first.segments);
        const hit = lookupWallCandidateBucket(slab, 100, 3, 7, 2);
        assert.equal(hit.hit, true);
        assert.equal(hit.segments, first.segments);
    });
    it("restamps stale frame without clearing the slab", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookupWallCandidateBucket(slab, 100, 3, 4, 2);
        first.segments.push("wall");
        commitWallCandidateBucket(slab, first.slot, 100, 3, 4, 2, first.segments);
        const stale = lookupWallCandidateBucket(slab, 100, 3, 5, 2);
        assert.equal(stale.hit, false);
        assert.equal(stale.segments, first.segments);
        assert.equal(stale.segments.length, 0);
    });
    it("invalidateWallCandidateBucketFrame recycles slots without releasing segment arrays", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookupWallCandidateBucket(slab, 100, 3, 4, 2);
        first.segments.push("wall");
        commitWallCandidateBucket(slab, first.slot, 100, 3, 4, 2, first.segments);
        invalidateWallCandidateBucketFrame(slab);
        assert.equal(slab.frameStamp[first.slot], -1);
        assert.equal(slab.segments[first.slot], first.segments);
        assert.equal(slab.segmentPool.length, 0);
    });
    it("reset on revision returns segment arrays to the pool", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookupWallCandidateBucket(slab, 100, 3, 4, 2);
        first.segments.push("wall");
        commitWallCandidateBucket(slab, first.slot, 100, 3, 4, 2, first.segments);
        resetWallCandidateBucketSlab(slab);
        assert.equal(slab.segmentPool.length, 1);
        assert.equal(slab.segmentPool[0], first.segments);
        assert.equal(slab.frameStamp[first.slot], -1);
    });
    it("SpatialFrameCore caches wall candidates per bucket within a frame", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        stampBlockedCell(grid, 4, 4);
        const frame = new SpatialFrameCore(16);
        frame.resetFrame(grid);
        const entity = mockKineticCircle(grid.gridCenterXByIdx(4 + 4 * grid.cols), grid.gridCenterYByIdx(4 + 4 * grid.cols), 4);
        const first = frame.getWallCandidates(entity);
        const second = frame.getWallCandidates(entity);
        assert.equal(first, second);
        assert.ok(first.length > 0);
    });
    it("SpatialFrameCore refills buckets on the next frame without Map.clear", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        stampBlockedCell(grid, 4, 4);
        const frame = new SpatialFrameCore(16);
        frame.resetFrame(grid);
        const entity = mockKineticCircle(grid.gridCenterXByIdx(4 + 4 * grid.cols), grid.gridCenterYByIdx(4 + 4 * grid.cols), 4);
        const frameOne = frame.getWallCandidates(entity);
        frame.resetFrame(grid);
        const frameTwo = frame.getWallCandidates(entity);
        assert.equal(frameOne, frameTwo);
        assert.ok(frameTwo.length > 0);
    });
    it("wallBucketKeyParts matches grid cell and pad", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        const parts = wallBucketKeyParts(grid, grid.gridCenterXByIdx(3), grid.gridCenterYByIdx(5 * grid.cols), 20);
        assert.equal(parts.keyLo, 3 | (5 << 16));
        assert.equal(parts.keyHi, 1 + Math.ceil(20 / 16));
    });
});
