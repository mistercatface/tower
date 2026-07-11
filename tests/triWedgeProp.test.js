import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
describe("tri wedge prop", () => {
    it("builds PolygonShape from asset localFootprint", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        const shape = prop.shape;
        assert.equal(shape.shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(shape.vertices.length / 2, 3);
        assert.ok(shape.vertices[0] < 0);
        assert.ok(shape.vertices[5] > 0);
    });
    it("uses bounding radius for broadphase", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        assert.ok(prop.radius > 9);
        assert.equal(prop.radius, prop.shape.getBoundingRadius());
    });
});
