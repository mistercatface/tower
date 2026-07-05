import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { segmentIntersectionPoint } from "../Libraries/Math/math.js";
import { minDistanceSegmentToWall } from "../Libraries/Physics/physics.js";
import {  hasLineOfSight  } from "../Libraries/Spatial/spatial.js";
function obstacleGridWithSegments(segments) {
    return {
        cellSize: 16,
        resetStaticWallProxyPool() {},
        appendStaticWallProxiesNear(_entity, out) {
            for (let i = 0; i < segments.length; i++) out.push(segments[i]);
        },
        appendStaticWallProxiesNearWorld(_x, _y, _queryRadius, out) {
            for (let i = 0; i < segments.length; i++) out.push(segments[i]);
        },
    };
}
describe("lineOfSight via Segment2D wall distance", () => {
    const wall = { x: 50, y: 0, angle: 0, size: 20, isDead: false };
    it("minDistanceSegmentToWall uses shared segment distance", () => {
        assert.ok(minDistanceSegmentToWall(0, 0, 100, 0, wall) < 20);
        assert.ok(minDistanceSegmentToWall(0, 40, 100, 40, wall) > 20);
    });
    it("segmentIntersectionPoint hits a wall footprint edge", () => {
        const hit = segmentIntersectionPoint(0, 0, 100, 0, 40, -20, 40, 20);
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
