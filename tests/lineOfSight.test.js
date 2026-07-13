import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minDistanceSegmentToWall } from "../Libraries/Physics/physics.js";
import { hasLineOfSight } from "../Libraries/Spatial/spatial.js";
import { mockWallSegment } from "./harness/wallSegmentHarness.js";
function obstacleGridWithSegments(segIds) {
    return {
        cellSize: 16,
        appendStaticWallSegmentsNearWorld(_x, _y, _queryRadius, out) {
            for (let i = 0; i < segIds.length; i++) out.push(segIds[i]);
        },
    };
}
describe("lineOfSight via Segment2D wall distance", () => {
    const wall = mockWallSegment(50, 0, 20);
    it("minDistanceSegmentToWall uses shared segment distance", () => {
        assert.ok(minDistanceSegmentToWall(0, 0, 100, 0, wall) < 20);
        assert.ok(minDistanceSegmentToWall(0, 40, 100, 40, wall) > 20);
    });
    it("hasLineOfSight blocks through a wall segment", () => {
        const obstacleGrid = obstacleGridWithSegments([wall]);
        assert.equal(hasLineOfSight(0, 0, 100, 0, obstacleGrid, 0, 0), false);
        assert.equal(hasLineOfSight(0, 40, 100, 40, obstacleGrid, 0, 0), true);
    });
});
