import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint } from "../Libraries/Props/propStrategy.js";
import { resolveVectorPropSpec } from "../Libraries/Render/vectorProp.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
loadPropAssets();
describe("vector prop overlay", () => {
    it("polygon spec comes from live shape vertices", () => {
        const prop = new WorldProp(0, 0, "tri_wedge", 0.25);
        const spec = resolveVectorPropSpec(prop, getPropAsset("tri_wedge"));
        assert.equal(spec.body.kind, "polygon");
        assert.equal(spec.body.vertices.length, 3);
        assert.equal(spec.body.facing, 0.25);
    });
    it("rectangle props use polygon verts not a separate rect kind", () => {
        const prop = new WorldProp(0, 0, "crate", 0);
        const spec = resolveVectorPropSpec(prop, getPropAsset("crate"));
        assert.equal(spec.body.kind, "polygon");
        assert.equal(spec.body.vertices.length, 4);
    });
    it("resized custom box vector footprint matches mutated shape", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        const spec = resolveVectorPropSpec(prop, getPropAsset("custom_box"));
        assert.equal(spec.body.kind, "polygon");
        assert.equal(spec.body.vertices[1].x, 12);
        assert.equal(spec.body.vertices[2].y, 5);
    });
    it("circle spec uses CircleShape radius", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(prop, 7);
        const spec = resolveVectorPropSpec(prop, getPropAsset("ball"));
        assert.equal(spec.body.kind, "circle");
        assert.equal(spec.body.radius, 7);
    });
    it("syncCollisionShape props still resolve polygon vector specs", () => {
        const prop = new WorldProp(0, 0, "flipper_left", 0);
        const spec = resolveVectorPropSpec(prop, getPropAsset("flipper_left"));
        assert.equal(spec.body.kind, "polygon");
        assert.ok(spec.body.vertices.length >= 4);
        assert.equal(spec.body.facing, prop._collisionFacing);
    });
});
