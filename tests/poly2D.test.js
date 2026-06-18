import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointInPolygon, rectCorners, rotatePoint, rotateXY, rotateXYInto, transformPoint2DInto } from "../Libraries/Math/Poly2D.js";
import { assertNear, assertPointNear } from "./mathHarness.js";
describe("Poly2D.rotateXY", () => {
    it("rotates with precomputed trig", () => {
        const hit = rotateXY(1, 0, 0, 1);
        assertPointNear(hit, 0, 1);
    });
    it("rotateXYInto writes out", () => {
        const out = { x: 9, y: 9 };
        rotateXYInto(out, 1, 0, 0, 1);
        assertPointNear(out, 0, 1);
    });
});
describe("Poly2D.transformPoint2DInto", () => {
    it("matches rotatePoint", () => {
        const fromHelper = transformPoint2DInto({ x: 0, y: 0 }, 10, 20, 3, 4, 1, 0);
        const fromRotatePoint = rotatePoint(10, 20, 3, 4, 0);
        assertPointNear(fromHelper, fromRotatePoint.x, fromRotatePoint.y);
    });
    it("applies rotation then translation", () => {
        const cos = Math.cos(Math.PI / 2);
        const sin = Math.sin(Math.PI / 2);
        const hit = transformPoint2DInto({ x: 0, y: 0 }, 5, 5, 2, 0, cos, sin);
        assertPointNear(hit, 5, 7);
    });
});
describe("Poly2D.rectCorners", () => {
    it("axis-aligned unit square", () => {
        const corners = rectCorners(0, 0, 1, 0);
        assert.equal(corners.length, 4);
        assertPointNear(corners[0], -1, -1);
        assertPointNear(corners[2], 1, 1);
    });
    it("rotated square preserves center symmetry", () => {
        const corners = rectCorners(0, 0, { x: 1, y: 1 }, Math.PI / 4);
        for (const corner of corners) assertNear(Math.hypot(corner.x, corner.y), Math.SQRT2);
    });
});
describe("Poly2D.pointInPolygon", () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ];
    it("inside", () => {
        assert.equal(pointInPolygon(5, 5, square), true);
    });
    it("outside", () => {
        assert.equal(pointInPolygon(15, 5, square), false);
    });
    it("on edge counts as inside", () => {
        assert.equal(pointInPolygon(5, 0, square), true);
        assert.equal(pointInPolygon(0, 5, square), true);
    });
    it("on vertex counts as inside", () => {
        assert.equal(pointInPolygon(0, 0, square), true);
        assert.equal(pointInPolygon(10, 10, square), true);
    });
    it("flat coordinate list", () => {
        assert.equal(pointInPolygon(5, 5, [0, 0, 10, 0, 10, 10, 0, 10]), true);
        assert.equal(pointInPolygon(15, 5, [0, 0, 10, 0, 10, 10, 0, 10]), false);
    });
    it("rejects too few vertices", () => {
        assert.equal(
            pointInPolygon(1, 1, [
                { x: 0, y: 0 },
                { x: 2, y: 0 },
            ]),
            false,
        );
        assert.equal(pointInPolygon(1, 1, [0, 0, 2, 0]), false);
    });
});
