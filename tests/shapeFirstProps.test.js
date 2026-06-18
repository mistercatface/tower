import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { kineticFootprintArea } from "../Libraries/Motion/bodyMass.js";
import { polygonSignedArea2D } from "../Libraries/Math/Poly2D.js";
loadPropAssets();
describe("shape-first props", () => {
    it("crate builds a four-corner polygon from localFootprint", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        const shape = prop.getShape();
        assert.equal(shape.type, "Polygon");
        assert.equal(shape.vertices.length, 4);
        assert.equal(kineticFootprintArea(prop), 256);
    });
    it("box_2x4 uses a 16×8 rectangle footprint", () => {
        const prop = new WorldProp(0, 0, "box_2x4", 0);
        const shape = prop.getShape();
        assert.equal(shape.type, "Polygon");
        assert.equal(Math.abs(polygonSignedArea2D(shape.vertices)), 128);
        assert.equal(kineticFootprintArea(prop), 128);
    });
    it("beach ball eager-inits CircleShape at spawn", () => {
        const prop = new WorldProp(0, 0, "beach_ball", 0);
        assert.equal(prop.shape.type, "Circle");
        assert.equal(prop.getShape().type, "Circle");
        assert.equal(prop.shape.radius, 7);
    });
    it("custom box footprint can be resized after spawn", () => {
        const prop = new WorldProp(10, 20, "custom_box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        assert.equal(prop.halfExtents.x, 12);
        assert.equal(prop.halfExtents.y, 5);
        assert.equal(prop.getShape().vertices.length, 4);
        assert.equal(kineticFootprintArea(prop), 240);
    });
});
