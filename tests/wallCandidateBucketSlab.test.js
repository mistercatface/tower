import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    WorldObstacleGrid,
    SpatialFrameCore,
    commitWallCandidateBucket,
    createWallCandidateBucketSlab,
    invalidateWallCandidateBucketFrame,
    lookupWallCandidateBucketInto,
    resetWallCandidateBucketSlab,
    wallBucketKeyPartsInto,
    collectWallSegmentsAlongLine,
} from "../Libraries/Spatial/spatial.js";
import { staticWallSegmentSlab, resetStaticWallSegmentSlab, MAX_STATIC_WALL_SEGMENTS } from "../Core/engineMemory.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab} from "./harness/kineticTickHarness.js";

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
        const miss = lookup(slab, 3, 1, 5, 2);
        miss.segIds.push(9);
        commitWallCandidateBucket(slab, miss.slot, 3, 1, 5, 2, miss.segIds);
        const hit = lookup(slab, 3, 1, 5, 2);
        assert.equal(hit.hit, true);
        assert.equal(hit.segIds.used, 1);
        assert.equal(hit.segIds.buf[0], 9);
    });
    it("restamps stale frame without clearing the slab", () => {
        const slab = createWallCandidateBucketSlab();
        const miss = lookup(slab, 4, 0, 1, 1);
        miss.segIds.push(2);
        commitWallCandidateBucket(slab, miss.slot, 4, 0, 1, 1, miss.segIds);
        const nextFrame = lookup(slab, 4, 0, 2, 1);
        assert.equal(nextFrame.hit, false);
        assert.equal(nextFrame.segIds.used, 0);
        nextFrame.segIds.push(7);
        commitWallCandidateBucket(slab, nextFrame.slot, 4, 0, 2, 1, nextFrame.segIds);
        const hit = lookup(slab, 4, 0, 2, 1);
        assert.equal(hit.hit, true);
        assert.equal(hit.segIds.buf[0], 7);
    });
    it("invalidateWallCandidateBucketFrame recycles slots without releasing segment arrays", () => {
        const slab = createWallCandidateBucketSlab();
        const miss = lookup(slab, 8, 2, 3, 0);
        const kept = miss.segIds;
        kept.push(4);
        commitWallCandidateBucket(slab, miss.slot, 8, 2, 3, 0, kept);
        invalidateWallCandidateBucketFrame(slab);
        const again = lookup(slab, 8, 2, 4, 0);
        assert.equal(again.hit, false);
        assert.equal(again.segIds, kept);
        assert.equal(again.segIds.used, 0);
    });
    it("reset on revision returns segment arrays to the pool", () => {
        const slab = createWallCandidateBucketSlab();
        const miss = lookup(slab, 9, 1, 1, 0);
        const pooled = miss.segIds;
        pooled.push(1);
        commitWallCandidateBucket(slab, miss.slot, 9, 1, 1, 0, pooled);
        resetWallCandidateBucketSlab(slab);
        assert.ok(slab.segIdPool.includes(pooled));
        const next = lookup(slab, 9, 1, 1, 1);
        assert.equal(next.hit, false);
        assert.equal(next.segIds.used, 0);
    });
    it("SpatialFrameCore caches wall candidates per bucket within a frame", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        stampBlockedCell(grid, 4, 4);
        const frame = new SpatialFrameCore(16);
        frame.resetFrame(grid);
        const entity = mockKineticCircle(grid.gridCenterXByIdx(4 + 4 * grid.cols), grid.gridCenterYByIdx(4 + 4 * grid.cols), 4);
        assignPhysIdWithPose(entity, 0);
        snapshotKineticBodySlab([entity._physId], 1);
        const a = frame.getWallCandidates(entity._physId);
        const b = frame.getWallCandidates(entity._physId);
        assert.equal(a, b);
        assert.ok(a.used > 0);
    });
    it("SpatialFrameCore refills buckets on the next frame without Map.clear", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 16, 16 * 16);
        stampBlockedCell(grid, 4, 4);
        const frame = new SpatialFrameCore(16);
        frame.resetFrame(grid);
        const entity = mockKineticCircle(grid.gridCenterXByIdx(4 + 4 * grid.cols), grid.gridCenterYByIdx(4 + 4 * grid.cols), 4);
        assignPhysIdWithPose(entity, 0);
        snapshotKineticBodySlab([entity._physId], 1);
        const frameOne = frame.getWallCandidates(entity._physId);
        frame.resetFrame(grid);
        const frameTwo = frame.getWallCandidates(entity._physId);
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
    it("interns static wall segments so long ray queries do not explode slab capacity", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 16 * 64, 16 * 16);
        for (let col = 0; col < 64; col++) stampBlockedCell(grid, col, 4);
        resetStaticWallSegmentSlab();
        const y = grid.gridCenterYByIdx(4 * grid.cols);
        const x0 = grid.gridCenterXByIdx(0);
        const x1 = grid.gridCenterXByIdx(63);
        const segs = collectWallSegmentsAlongLine(grid, x0, y, x1, y, 24);
        assert.ok(segs.used > 0);
        assert.ok(staticWallSegmentSlab.count < MAX_STATIC_WALL_SEGMENTS);
        assert.ok(staticWallSegmentSlab.count <= segs.used + 8);
        const again = collectWallSegmentsAlongLine(grid, x0, y, x1, y, 24);
        assert.equal(again.used, segs.used);
        assert.ok(staticWallSegmentSlab.count <= segs.used + 8);
    });
});
