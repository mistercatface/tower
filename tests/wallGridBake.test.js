import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectRailWallBoxesInAabbF32, RAIL_BOX_STRIDE } from "../Libraries/World/wallGridBake.js";
import { StrideFloatList } from "../Libraries/World/StrideFloatList.js";
import { makeTestObstacleGrid, stampRailWallEdge } from "./harness/losShadowHarness.js";

const TEST_BOUNDS_BUF = new Float32Array([-1024, -1024, 1024, 1024]);

describe("wall grid bake", () => {
    it("does not merge collinear rail boxes across chunk boundaries", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampRailWallEdge(grid, 7, 2, 0, 1);
        stampRailWallEdge(grid, 8, 2, 0, 1);
        const boxes = new StrideFloatList(RAIL_BOX_STRIDE);

        collectRailWallBoxesInAabbF32(grid, TEST_BOUNDS_BUF, 0, boxes);

        assert.equal(boxes.length, 2);
    });

    it("still merges collinear rail boxes inside one chunk", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampRailWallEdge(grid, 6, 2, 0, 1);
        stampRailWallEdge(grid, 7, 2, 0, 1);
        const boxes = new StrideFloatList(RAIL_BOX_STRIDE);

        collectRailWallBoxesInAabbF32(grid, TEST_BOUNDS_BUF, 0, boxes);

        assert.equal(boxes.length, 1);
    });
});
