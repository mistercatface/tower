import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closestPointOnLineSegmentInto, distanceSqToLineSegment, distanceToLineSegment } from "../Libraries/Math/math.js";
import { ENGINE_F32, M_OUT_CLOSEST_X, M_OUT_CLOSEST_Y, M_OUT_CLOSEST_T } from "../Core/engineMemory.js";
import { assertNear, assertPointNear, seg } from "./mathHarness.js";
function closestFromInto(px, py, vx, vy, wx, wy) {
    closestPointOnLineSegmentInto(px, py, vx, vy, wx, wy);
    return { x: ENGINE_F32[M_OUT_CLOSEST_X], y: ENGINE_F32[M_OUT_CLOSEST_Y], t: ENGINE_F32[M_OUT_CLOSEST_T] };
}
describe("Segment2D.closestPointOnLineSegment", () => {
    it("interior projection", () => {
        const closest = closestFromInto(5, 5, 0, 0, 10, 0);
        assertPointNear(closest, 5, 0);
        assertNear(closest.t, 0.5);
    });
    it("clamps before start", () => {
        const closest = closestFromInto(-5, 0, 0, 0, 10, 0);
        assertPointNear(closest, 0, 0);
        assertNear(closest.t, 0);
    });
    it("clamps after end", () => {
        const closest = closestFromInto(15, 0, 0, 0, 10, 0);
        assertPointNear(closest, 10, 0);
        assertNear(closest.t, 1);
    });
    it("degenerate zero-length segment", () => {
        const closest = closestFromInto(3, 4, 1, 2, 1, 2);
        assertPointNear(closest, 1, 2);
        assertNear(closest.t, 0);
    });
});
describe("Segment2D point-to-segment distance", () => {
    const { ax, ay, bx, by } = seg(0, 0, 10, 0);
    it("distanceSq matches closest point offset", () => {
        const closest = closestFromInto(5, 3, ax, ay, bx, by);
        const distSq = distanceSqToLineSegment(5, 3, ax, ay, bx, by);
        assertNear(distSq, 3 * 3);
        assertPointNear(closest, 5, 0);
    });
    it("distance is sqrt of distanceSq", () => {
        assertNear(distanceToLineSegment(5, 3, ax, ay, bx, by), 3);
    });
});
