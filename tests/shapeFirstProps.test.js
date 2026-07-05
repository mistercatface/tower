import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint, propFootprintHalfExtents } from "../Libraries/Props/props.js";
import { kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
describe("shape-first props", () => {
    it("crate builds a four-corner polygon from localFootprint", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        const shape = prop.shape;
        assert.equal(shape.type, "Polygon");
        assert.equal(shape.vertices.length / 2, 4);
        assert.equal(kineticFootprintArea(prop), 256);
    });
    it("custom box can use a 16×8 rectangle footprint", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 8, 4);
        const shape = prop.shape;
        assert.equal(shape.type, "Polygon");
        assert.equal(Math.abs(polygonSignedArea2D(shape.vertices)), 128);
        assert.equal(kineticFootprintArea(prop), 128);
    });
    it("ball radius can be resized after spawn", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(prop, 7);
        assert.equal(prop.shape.type, "Circle");
        assert.equal(prop.shape.type, "Circle");
        assert.equal(prop.shape.radius, 7);
    });
    it("custom box footprint can be resized after spawn", () => {
        const prop = new WorldProp(10, 20, "custom_box", 0);
        assert.ok(prop.chunks.length > 1);
        applyPropBoxFootprint(prop, 12, 5);
        const span = propFootprintHalfExtents(prop);
        assert.equal(span.x, 12);
        assert.equal(span.y, 5);
        assert.equal(prop.shape.vertices.length / 2, 4);
        assert.equal(kineticFootprintArea(prop), 240);
        assert.ok(prop.chunks.length > 1);
    });
    it("hex block builds a six-vertex polygon from localFootprint", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        assert.equal(prop.shape.type, "Polygon");
        assert.equal(prop.shape.vertices.length / 2, 6);
    });
});
