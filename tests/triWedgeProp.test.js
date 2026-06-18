import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
loadPropAssets();
describe("tri wedge prop", () => {
    it("builds PolygonShape from asset localFootprint", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        const shape = prop.getShape();
        assert.equal(shape.type, "Polygon");
        assert.equal(shape.vertices.length, 3);
        assert.ok(shape.vertices[0].x < 0);
        assert.ok(shape.vertices[2].y > 0);
    });
    it("uses bounding radius for broadphase", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0);
        assert.ok(prop.radius > 9);
        assert.equal(prop.radius, prop.shape.getBoundingRadius());
    });
});
