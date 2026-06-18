import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtents, resolvePropQuantizeSteps } from "../Libraries/Props/propStrategy.js";
import { resolveBodyRadius } from "../Libraries/Motion/bodyDefaults.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { createPolygonPrimitive } from "../Libraries/Props/primitives/polygonPrimitive.js";
import { kineticFootprintArea } from "../Libraries/Motion/bodyMass.js";
import { polygonSignedArea2D } from "../Libraries/Math/Poly2D.js";
import { quantizeAngleIndex, quantizeAngle } from "../Libraries/Canvas/viewQuantize.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Libraries/Props/rollingMotion.js";
import { resolveVectorPropSpec } from "../Libraries/Render/vectorProp.js";
import { getPropAsset } from "../Libraries/Props/PropCatalog.js";
loadPropAssets();
const cacheKeyDeps = { quantizeAngleIndex, buildRollOrientKey };
const polygonVisuals = {
    colors: { side: "#888", sideShadow: "#666", top: "#aaa", bottom: "#444", stroke: "#222" },
    world: { height: 10 },
};
function createMockCtx() {
    const gradient = { addColorStop() {} };
    return {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        createLinearGradient: () => gradient,
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
        stroke() {},
    };
}
describe("draw shape parity", () => {
    it("hex block shares polygon sim and draw footprint with six vertices", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        const shape = prop.getShape();
        assert.equal(shape.type, "Polygon");
        assert.equal(shape.vertices.length, 6);
        assert.ok(Math.abs(polygonSignedArea2D(shape.vertices)) > 160);
        assert.equal(kineticFootprintArea(prop), Math.abs(polygonSignedArea2D(shape.vertices)));
    });
    it("hex and tri wedge bucket different sprite cache footprints", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        const hexKey = getBaseSpriteCacheKey(hex, cacheKeyDeps);
        const wedgeKey = getBaseSpriteCacheKey(wedge, cacheKeyDeps);
        assert.notEqual(hexKey, wedgeKey);
    });
    it("resized custom box changes sprite cache footprint bucket", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        const before = getBaseSpriteCacheKey(prop, cacheKeyDeps);
        applyPropBoxFootprint(prop, 12, 5);
        const after = getBaseSpriteCacheKey(prop, cacheKeyDeps);
        assert.notEqual(before, after);
        assert.match(after, /12,5/);
    });
    it("sprite bake stage passes live polygon verts to draw", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        const stageProp = getPropStageBakeState(prop, { quantizeAngle, quantizeRollQuat, anchorX: 50, anchorY: 50 });
        assert.equal(stageProp.shape.vertices.length, 6);
        assert.equal(stageProp.shape.vertices[0].x, prop.shape.vertices[0].x);
        assert.equal(stageProp.halfExtents.x, propFootprintHalfExtents(prop).x);
    });
    it("polygon primitive extrudes live shape without a parallel rect path", () => {
        const prop = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        const draw = createPolygonPrimitive(polygonVisuals);
        draw(createMockCtx(), prop, 100, 100);
        assert.equal(prop.getShape().vertices[1].x, 12);
        assert.equal(prop.getShape().vertices[2].y, 5);
    });
    it("hex block resolves six-vertex vector overlay spec", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0.5);
        const spec = resolveVectorPropSpec(prop, getPropAsset("hex_block"));
        assert.equal(spec.body.kind, "polygon");
        assert.equal(spec.body.vertices.length, 6);
        assert.equal(spec.body.facing, 0.5);
    });
    it("resolveBodyRadius prefers CircleShape over stale radius field", () => {
        const prop = new WorldProp(0, 0, "ball", 0);
        setCirclePropRadius(prop, 7);
        prop.radius = 99;
        assert.equal(prop.shape.radius, 7);
        assert.equal(resolveBodyRadius(prop), 7);
    });
    it("large footprints use finer sprite facing steps than crate-sized props", () => {
        const crate = new WorldProp(0, 0, "crate", 0);
        const plank = new WorldProp(0, 0, "custom_box", 0);
        applyPropBoxFootprint(plank, 64, 8);
        assert.equal(resolvePropQuantizeSteps(crate).facing, 16);
        assert.equal(resolvePropQuantizeSteps(plank).facing, 128);
    });
});
