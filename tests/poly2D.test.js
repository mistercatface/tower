import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointInPolygon, rectCorners, rotatePoint, rotateXY, rotateXYInto, transformPoint2DInto, ensureFlatVerts, reversePolygonWinding, polygonSignedArea2D } from "../Libraries/Math/math.js";
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
        assert.equal(corners.length, 8);
        assertPointNear({ x: corners[0], y: corners[1] }, -1, -1);
        assertPointNear({ x: corners[4], y: corners[5] }, 1, 1);
    });
    it("rotated square preserves center symmetry", () => {
        const corners = rectCorners(0, 0, { x: 1, y: 1 }, Math.PI / 4);
        for (let i = 0; i < 4; i++) {
            assertNear(Math.hypot(corners[i * 2], corners[i * 2 + 1]), Math.SQRT2, 1e-6);
        }
    });
});
describe("Poly2D.pointInPolygon", () => {
    const square = new Float32Array([
        0, 0,
        10, 0,
        10, 10,
        0, 10,
    ]);
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
            pointInPolygon(1, 1, new Float32Array([
                0, 0,
                2, 0,
            ])),
            false,
        );
        assert.equal(pointInPolygon(1, 1, [0, 0, 2, 0]), false);
    });
});
describe("Poly2D.ensureFlatVerts", () => {
    it("handles Float32Array", () => {
        const flat = new Float32Array([1, 2, 3, 4]);
        const res = ensureFlatVerts(flat);
        assert.equal(res, flat);
    });
    it("handles number array", () => {
        const arr = [1, 2, 3, 4];
        const res = ensureFlatVerts(arr);
        assert.ok(res instanceof Float32Array);
        assert.equal(res.length, 4);
        assert.equal(res[2], 3);
    });
    it("handles array of objects", () => {
        const objs = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
        const res = ensureFlatVerts(objs);
        assert.ok(res instanceof Float32Array);
        assert.equal(res.length, 4);
        assert.equal(res[0], 1);
        assert.equal(res[1], 2);
        assert.equal(res[2], 3);
        assert.equal(res[3], 4);
    });
});
describe("Poly2D.reversePolygonWinding", () => {
    it("reverses winding order of flat coordinate array", () => {
        const original = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
        const reversed = reversePolygonWinding(original);
        assert.deepEqual(Array.from(reversed), [0, 10, 10, 10, 10, 0, 0, 0]);
    });
});
import { PolygonShape } from "../Libraries/Physics/physics.js";
describe("PolygonShape winding order enforcement", () => {
    it("preserves counter-clockwise winding", () => {
        const ccw = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
        const shape = new PolygonShape(ccw);
        assert.ok(polygonSignedArea2D(shape.vertices) > 0);
        assert.deepEqual(Array.from(shape.vertices), [0, 0, 10, 0, 10, 10, 0, 10]);
    });
    it("reverses clockwise winding to counter-clockwise", () => {
        const cw = new Float32Array([0, 0, 0, 10, 10, 10, 10, 0]);
        const shape = new PolygonShape(cw);
        assert.ok(polygonSignedArea2D(shape.vertices) > 0);
        assert.deepEqual(Array.from(shape.vertices), [10, 0, 10, 10, 0, 10, 0, 0]);
    });
});

