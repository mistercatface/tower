import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closestPointOnLineSegment, distanceSegmentToSegment, distanceSqToLineSegment, distanceToLineSegment, segmentIntersectionPoint, segmentsIntersect } from "../Libraries/Math/math.js";
import { assertNear, assertPointNear, seg } from "./mathHarness.js";
describe("Segment2D.segmentsIntersect", () => {
    it("crossing diagonals", () => {
        assert.equal(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0), true);
    });
    it("parallel separated", () => {
        assert.equal(segmentsIntersect(0, 0, 10, 0, 0, 1, 10, 1), false);
    });
    it("endpoint touch", () => {
        assert.equal(segmentsIntersect(0, 0, 5, 0, 5, 0, 5, 5), true);
    });
    it("collinear overlap", () => {
        assert.equal(segmentsIntersect(0, 0, 10, 0, 5, 0, 15, 0), true);
    });
    it("collinear gap reports intersect (orientation test does not check overlap span)", () => {
        assert.equal(segmentsIntersect(0, 0, 2, 0, 5, 0, 7, 0), true);
    });
});
describe("Segment2D.segmentIntersectionPoint", () => {
    it("returns crossing point and parameters", () => {
        const hit = segmentIntersectionPoint(0, 0, 10, 10, 0, 10, 10, 0);
        assert.ok(hit);
        assertPointNear(hit, 5, 5);
        assertNear(hit.t, 0.5);
        assertNear(hit.u, 0.5);
    });
    it("returns null for parallel segments", () => {
        assert.equal(segmentIntersectionPoint(0, 0, 10, 0, 0, 1, 10, 1), null);
    });
    it("returns null for skew miss", () => {
        assert.equal(segmentIntersectionPoint(0, 0, 1, 0, 5, 5, 6, 5), null);
    });
    it("returns null for collinear overlap (bool still true)", () => {
        assert.equal(segmentsIntersect(0, 0, 10, 0, 5, 0, 15, 0), true);
        assert.equal(segmentIntersectionPoint(0, 0, 10, 0, 5, 0, 15, 0), null);
    });
    it("endpoint touch", () => {
        const hit = segmentIntersectionPoint(0, 0, 5, 0, 5, 0, 5, 5);
        assert.ok(hit);
        assertPointNear(hit, 5, 0);
        assertNear(hit.t, 1);
        assertNear(hit.u, 0);
    });
});
describe("Segment2D.distanceSegmentToSegment", () => {
    it("zero when segments cross", () => {
        assertNear(distanceSegmentToSegment(0, 0, 10, 10, 0, 10, 10, 0), 0);
    });
    it("parallel gap", () => {
        assertNear(distanceSegmentToSegment(0, 0, 10, 0, 0, 2, 10, 2), 2);
    });
    it("endpoint nearest-neighbor", () => {
        assertNear(distanceSegmentToSegment(0, 0, 1, 0, 3, 0, 4, 0), 2);
    });
});
describe("Segment2D.closestPointOnLineSegment", () => {
    it("interior projection", () => {
        const closest = closestPointOnLineSegment(5, 5, 0, 0, 10, 0);
        assertPointNear(closest, 5, 0);
        assertNear(closest.t, 0.5);
    });
    it("clamps before start", () => {
        const closest = closestPointOnLineSegment(-5, 0, 0, 0, 10, 0);
        assertPointNear(closest, 0, 0);
        assertNear(closest.t, 0);
    });
    it("clamps after end", () => {
        const closest = closestPointOnLineSegment(15, 0, 0, 0, 10, 0);
        assertPointNear(closest, 10, 0);
        assertNear(closest.t, 1);
    });
    it("degenerate zero-length segment", () => {
        const closest = closestPointOnLineSegment(3, 4, 1, 2, 1, 2);
        assertPointNear(closest, 1, 2);
        assertNear(closest.t, 0);
    });
});
describe("Segment2D point-to-segment distance", () => {
    const { ax, ay, bx, by } = seg(0, 0, 10, 0);
    it("distanceSq matches closest point offset", () => {
        const closest = closestPointOnLineSegment(5, 3, ax, ay, bx, by);
        const distSq = distanceSqToLineSegment(5, 3, ax, ay, bx, by);
        assertNear(distSq, 3 * 3);
        assertPointNear(closest, 5, 0);
    });
    it("distance is sqrt of distanceSq", () => {
        assertNear(distanceToLineSegment(5, 3, ax, ay, bx, by), 3);
    });
});
