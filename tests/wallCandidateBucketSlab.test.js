import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  SpatialFrameCore  } from "../Libraries/Spatial/spatial.js";
import { 
    commitWallCandidateBucket,
    createWallCandidateBucketSlab,
    invalidateWallCandidateBucketFrame,
    lookupWallCandidateBucketInto,
    resetWallCandidateBucketSlab,
    wallBucketKeyPartsInto,
 } from "../Libraries/Spatial/spatial.js";
import { mockKineticCircle } from "./harness/kineticTickHarness.js";

function stampBlockedCell(grid, col, row) {
    grid.grid[worldIdxAtCell(grid, col, row)] = 1;
}

const sHitSlot = new Int32Array(2);
const sKey = new Int32Array(2);

function lookup(slab, keyLo, keyHi, frameId, revision) {
    const segIds = lookupWallCandidateBucketInto(sHitSlot, slab, keyLo, keyHi, frameId, revision);
    return { hit: sHitSlot[0] !== 0, slot: sHitSlot[1], segIds };
}

describe("wall candidate bucket slab", () => {
    it("reuses segment arrays on miss instead of allocating fresh buckets", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookup(slab, 1, 2, 10, 0);
        const firstSegIds = first.segIds;
        const firstSlot = first.slot;
        firstSegIds.push(1);
        commitWallCandidateBucket(slab, firstSlot, 1, 2, 10, 0, firstSegIds);
        const stale = lookup(slab, 1, 2, 11, 0);
        assert.equal(stale.hit, false);
        assert.equal(stale.segIds, firstSegIds);
        assert.equal(stale.segIds.used, 0);
    });
    it("hits same bucket within a frame and revision", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookup(slab, 100, 3, 7, 2);
        const firstSegIds = first.segIds;
        firstSegIds.push(1);
        commitWallCandidateBucket(slab, first.slot, 100, 3, 7, 2, firstSegIds);
        const hit = lookup(slab, 100, 3, 7, 2);
        assert.equal(hit.hit, true);
        assert.equal(hit.segIds, firstSegIds);
    });
    it("restamps stale frame without clearing the slab", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookup(slab, 100, 3, 4, 2);
        const firstSegIds = first.segIds;
        firstSegIds.push(1);
        commitWallCandidateBucket(slab, first.slot, 100, 3, 4, 2, firstSegIds);
        const stale = lookup(slab, 100, 3, 5, 2);
        assert.equal(stale.hit, false);
        assert.equal(stale.segIds, firstSegIds);
        assert.equal(stale.segIds.used, 0);
    });
    it("invalidateWallCandidateBucketFrame recycles slots without releasing segment arrays", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookup(slab, 100, 3, 4, 2);
        const firstSegIds = first.segIds;
        const firstSlot = first.slot;
        firstSegIds.push(1);
        commitWallCandidateBucket(slab, firstSlot, 100, 3, 4, 2, firstSegIds);
        invalidateWallCandidateBucketFrame(slab);
        assert.equal(slab.frameStamp[firstSlot], -1);
        assert.equal(slab.segIds[firstSlot], firstSegIds);
        assert.equal(slab.segIdPool.length, 0);
    });
    it("reset on revision returns segment arrays to the pool", () => {
        const slab = createWallCandidateBucketSlab();
        const first = lookup(slab, 100, 3, 4, 2);
        const firstSegIds = first.segIds;
        const firstSlot = first.slot;
        firstSegIds.push(1);
        commitWallCandidateBucket(slab, firstSlot, 100, 3, 4, 2, firstSegIds);
        resetWallCandidateBucketSlab(slab);
        assert.equal(slab.segIdPool.length, 1);
        assert.equal(slab.segIdPool[0], firstSegIds);
        assert.equal(slab.frameStamp[firstSlot], -1);
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
        assert.ok(first.used > 0);
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
        assert.ok(frameTwo.used > 0);
    });
    it("wallBucketKeyPartsInto matches grid cell and pad", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        wallBucketKeyPartsInto(sKey, 0, grid, grid.gridCenterXByIdx(3), grid.gridCenterYByIdx(5 * grid.cols), 20);
        assert.equal(sKey[0], 3 | (5 << 16));
        assert.equal(sKey[1], 1 + Math.ceil(20 / 16));
    });
});
