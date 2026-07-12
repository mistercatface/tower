import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { segmentIntersectionPointIntoF32 } from "../Libraries/Math/math.js";
import { minDistanceSegmentToWall } from "../Libraries/Physics/physics.js";
import { hasLineOfSight } from "../Libraries/Spatial/spatial.js";
import { mockWallSegment } from "./harness/wallSegmentHarness.js";
const sIntersectionResult = new Float32Array(4);
function getIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    const success = segmentIntersectionPointIntoF32(sIntersectionResult, 0, ax, ay, bx, by, cx, cy, dx, dy);
    if (!success) return null;
    return {
        x: sIntersectionResult[0],
        y: sIntersectionResult[1],
        t: sIntersectionResult[2],
        u: sIntersectionResult[3]
    };
}
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
    it("segmentIntersectionPoint hits a wall footprint edge", () => {
        const hit = getIntersection(0, 0, 100, 0, 40, -20, 40, 20);
        assert.ok(hit);
        assert.equal(hit.x, 40);
        assert.equal(hit.y, 0);
    });
    it("hasLineOfSight blocks through a wall segment", () => {
        const obstacleGrid = obstacleGridWithSegments([wall]);
        assert.equal(hasLineOfSight(0, 0, 100, 0, obstacleGrid, 0, 0), false);
        assert.equal(hasLineOfSight(0, 40, 100, 40, obstacleGrid, 0, 0), true);
    });
});
