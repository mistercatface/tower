import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Entities/WorldProp.js";
import { applyPropBoxFootprint, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtents, resolvePropQuantizeSteps } from "../Libraries/Props/propStrategy.js";
import { resolveBodyRadius } from "../Libraries/Motion/bodyDefaults.js";
import { setCirclePropRadius } from "../Libraries/Props/propScale.js";
import { createPolygonPrimitive } from "../Libraries/Props/primitives/polygonPrimitive.js";
import { kineticFootprintArea } from "../Libraries/Motion/bodyMass.js";
import { polygonSignedArea2D } from "../Libraries/Math/Poly2D.js";
import { quantizeAngleIndex, quantizeAngle } from "../Libraries/Math/Angle.js";
import { buildRollOrientKey, quantizeRollQuat } from "../Libraries/Props/rollingMotion.js";
import { worldPropAssets } from "../Libraries/Props/PropCatalog.js";
import { resolveVisualAttachmentBakeRadius, resolveVisualAttachmentProps, getVisualAttachmentSpriteCacheKey } from "../Libraries/Props/propVisualAttachments.js";
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
    it("flee ball declares a render-only tri wedge facing attachment", () => {
        const attachment = worldPropAssets["flee_ball"].visuals.attachments[0];
        assert.equal(attachment.id, "movement_arrow");
        assert.equal(attachment.propId, "tri_wedge");
        assert.equal(attachment.heading, "velocity");
        assert.equal(attachment.offsetSpace, "parentRadius");
        assert.equal(attachment.inheritTint, true);
    });
    it("visual attachments resolve from quantized velocity heading", () => {
        const prop = new WorldProp(0, 0, "flee_ball", 0);
        prop.vx = 0;
        prop.vy = 25;
        const stageProp = getPropStageBakeState(prop, { quantizeAngle, quantizeRollQuat, anchorX: 50, anchorY: 60 });
        const qHeading = quantizeAngle(Math.atan2(prop.vy, prop.vx), resolvePropQuantizeSteps(prop).facing);
        const attachments = resolveVisualAttachmentProps(stageProp);
        assert.equal(attachments.before.length, 0);
        assert.equal(attachments.after.length, 1);
        const child = attachments.after[0];
        assert.equal(child instanceof WorldProp, false);
        assert.equal(child.type, "tri_wedge");
        assert.ok(Math.abs(child.x - 50) < 1e-6);
        assert.ok(Math.abs(child.y - (60 + resolveBodyRadius(prop) * 1.65)) < 1e-6);
        assert.ok(Math.abs(child.facing - (qHeading - Math.PI / 2)) < 1e-6);
        assert.ok(child.radius < new WorldProp(0, 0, "tri_wedge", 0).radius);
    });
    it("visual attachments scale and offset from parent radius", () => {
        const small = new WorldProp(0, 0, "flee_ball", 0);
        const large = new WorldProp(0, 0, "flee_ball", 0);
        setCirclePropRadius(large, resolveBodyRadius(small) * 2);
        small.vx = 30;
        large.vx = 30;
        const smallChild = resolveVisualAttachmentProps(getPropStageBakeState(small, { quantizeAngle, quantizeRollQuat, anchorX: 0, anchorY: 0 })).after[0];
        const largeChild = resolveVisualAttachmentProps(getPropStageBakeState(large, { quantizeAngle, quantizeRollQuat, anchorX: 0, anchorY: 0 })).after[0];
        assert.ok(Math.abs(largeChild.x - smallChild.x * 2) < 1e-6);
        assert.ok(Math.abs(largeChild.radius - smallChild.radius * 2) < 1e-6);
        assert.ok(Math.abs(largeChild.height - smallChild.height * 2) < 1e-6);
        assert.ok(smallChild.height < worldPropAssets["tri_wedge"].visuals.world.height);
    });
    it("visual attachments expand bake bounds and facing cache keys", () => {
        const right = new WorldProp(0, 0, "flee_ball", 0);
        const down = new WorldProp(0, 0, "flee_ball", 0);
        right.vx = 10;
        down.vy = 10;
        const parentRadius = resolveBodyRadius(right);
        assert.ok(resolveVisualAttachmentBakeRadius(right, 0) > parentRadius);
        assert.notEqual(
            getVisualAttachmentSpriteCacheKey(right, { quantizeAngleIndex }),
            getVisualAttachmentSpriteCacheKey(down, { quantizeAngleIndex }),
        );
    });
});
