import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint, getBaseSpriteCacheKey, getPropStageBakeState, propFootprintHalfExtentsInto, resolvePropQuantizeSteps } from "../Libraries/Props/props.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { createWallChunkDraw } from "../Libraries/Render/render.js";
import { kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { quantizeAngleIndex, quantizeAngle } from "../Libraries/Math/math.js";
import { ATTACH_HEADING_FACING, ATTACH_OFFSET_PARENT_RADIUS, SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";
import { resolveVisualAttachmentBakeRadius, resolveVisualAttachmentProps, getVisualAttachmentSpriteCacheKey } from "../Libraries/Props/props.js";
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH } from "../Libraries/Viewport/Viewport.js";
import propCatalog from "../Assets/props/index.js";
import { gridSettings } from "../Config/world.js";
const cacheKeyDeps = { quantizeAngleIndex };
describe("draw shape parity", () => {
    it("hex block shares polygon sim and draw footprint with six vertices", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        const shape = prop.shape;
        assert.equal(shape.shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(shape.vertices.length / 2, 6);
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
        const prop = new WorldProp(0, 0, "box", 0);
        const before = getBaseSpriteCacheKey(prop, cacheKeyDeps);
        applyPropBoxFootprint(prop, 12, 5);
        const after = getBaseSpriteCacheKey(prop, cacheKeyDeps);
        assert.notEqual(before, after);
        assert.match(after, /[0-9]+/);
    });
    it("sprite bake stage passes live polygon verts to draw", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        const stageProp = getPropStageBakeState(prop);
        assert.equal(stageProp.shape.vertices.length / 2, 6);
        assert.equal(stageProp.shape.vertices[0], prop.shape.vertices[0]);
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
        assert.equal(stageProp.halfExtents.x, ENGINE_F32[M_VEC_A]);
    });
    it("polygon primitive fills flat silhouette in 2d from live shape", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        const draw = createWallChunkDraw();
        const calls = { beginPath: 0, fill: 0, stroke: 0 };
        const ctx = {
            beginPath() { calls.beginPath++; },
            fill() { calls.fill++; },
            stroke() { calls.stroke++; },
            fillStyle: "",
            moveTo() {},
            lineTo() {},
            closePath() {},
        };
        const viewport = {
            x: 100,
            y: 100,
            zoom: 1,
            cameraHeight: DEFAULT_CAMERA_HEIGHT,
            perspectiveStrength: DEFAULT_PERSPECTIVE_STRENGTH,
        };
        draw(ctx, prop, viewport, true);
        assert.equal(calls.beginPath, 1);
        assert.equal(calls.fill, 1);
        assert.equal(calls.stroke, 0);
        assert.equal(prop.shape.vertices[2], 12);
        assert.equal(prop.shape.vertices[5], 5);
    });
    it("textured flat wall-chunk cap fills live polygon path (not clip+triangle quad)", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        prop._wallChunkTextures = {
            ready: true,
            scale: 1,
            chunkSizePx: 128,
            capCanvas: { width: 128, height: 128 },
        };
        prop._wallChunkTextureReady = true;
        const draw = createWallChunkDraw();
        const path = [];
        let fills = 0;
        let createPattern = 0;
        let drawImage = 0;
        const ctx = {
            fillStyle: "",
            beginPath() { path.length = 0; },
            moveTo(x, y) { path.push([x, y]); },
            lineTo(x, y) { path.push([x, y]); },
            closePath() {},
            fill() { fills++; },
            createPattern() {
                createPattern++;
                return { setTransform() {} };
            },
            drawImage() { drawImage++; },
            save() {},
            restore() {},
            clip() {},
            getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
            setTransform() {},
            transform() {},
        };
        const viewport = {
            x: 0,
            y: 0,
            zoom: 1,
            cameraHeight: DEFAULT_CAMERA_HEIGHT,
            perspectiveStrength: DEFAULT_PERSPECTIVE_STRENGTH,
        };
        draw(ctx, prop, viewport, true);
        assert.equal(createPattern, 1);
        assert.equal(fills, 1);
        assert.equal(drawImage, 0);
        assert.equal(path.length, 6);
        assert.equal(path[0][0], 0);
        assert.equal(path[0][1], -8);
    });
    it("polygon primitive extrudes in radial without textures as solid pending fill", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        assert.equal(prop.height, gridSettings.cellSize);
        assert.equal(prop.wallChunkHeightPx, gridSettings.cellSize);
        const draw = createWallChunkDraw();
        const calls = { fill: 0, stroke: 0 };
        const ctx = {
            beginPath() {},
            fill() { calls.fill++; },
            stroke() { calls.stroke++; },
            fillStyle: "",
            moveTo() {},
            lineTo() {},
            closePath() {},
            createLinearGradient() { return { addColorStop() {} }; },
        };
        const viewport = {
            x: 100,
            y: 100,
            zoom: 1,
            cameraHeight: DEFAULT_CAMERA_HEIGHT,
            perspectiveStrength: DEFAULT_PERSPECTIVE_STRENGTH,
        };
        draw(ctx, prop, viewport, false);
        assert.ok(calls.fill > 1);
        assert.equal(calls.stroke, 0);
    });
    it("large footprints use finer sprite facing steps than crate-sized props", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        const plank = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(plank, 64, 8);
        assert.equal(resolvePropQuantizeSteps(crate).facing, 16);
        assert.equal(resolvePropQuantizeSteps(plank).facing, 360);
    });
    it("boid triangle uses finer facing quantization through its prop strategy", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        const triangle = new WorldProp(0, 0, "boid_triangle", 0);
        assert.equal(resolvePropQuantizeSteps(crate).facing, 16);
        assert.equal(resolvePropQuantizeSteps(triangle).facing, 64);
    });
    it("boid triangle declares a render-only tri wedge facing attachment", () => {
        const attachment = propCatalog["boid_triangle"].visuals.attachments[0];
        assert.equal(attachment.id, "movement_arrow");
        assert.equal(attachment.propId, "tri_wedge");
        assert.equal(attachment.heading, ATTACH_HEADING_FACING);
        assert.equal(attachment.offsetSpace, ATTACH_OFFSET_PARENT_RADIUS);
        assert.equal(attachment.inheritTint, undefined);
    });
    it("visual attachments resolve from quantized facing", () => {
        const prop = new WorldProp(0, 0, "boid_triangle", 0);
        prop.facing = Math.PI / 2;
        const stageProp = getPropStageBakeState(prop);
        const qHeading = quantizeAngle(prop.facing, resolvePropQuantizeSteps(prop).facing);
        const attachments = resolveVisualAttachmentProps(stageProp);
        assert.equal(attachments.before.length, 0);
        assert.equal(attachments.after.length, 1);
        const child = attachments.after[0];
        assert.equal(child instanceof WorldProp, false);
        assert.equal(child.type, "tri_wedge");
        assert.ok(Math.abs(child.x) < 1e-6);
        assert.ok(Math.abs(child.y - prop.radius * 1.65) < 1e-6);
        assert.ok(Math.abs(child.facing - (qHeading - Math.PI / 2)) < 1e-6);
        assert.ok(child.radius < new WorldProp(0, 0, "tri_wedge", 0).radius);
    });
    it("visual attachments scale and offset from parent radius", () => {
        const small = new WorldProp(0, 0, "boid_triangle", 0);
        const large = new WorldProp(0, 0, "boid_triangle", 0);
        setCirclePropRadius(large, small.radius * 2);
        small.vx = 30;
        large.vx = 30;
        const smallChild = resolveVisualAttachmentProps(getPropStageBakeState(small)).after[0];
        const largeChild = resolveVisualAttachmentProps(getPropStageBakeState(large)).after[0];
        assert.ok(Math.abs(largeChild.x - smallChild.x * 2) < 1e-6);
        assert.ok(Math.abs(largeChild.radius - smallChild.radius * 2) < 1e-6);
        assert.ok(Math.abs(largeChild.height - smallChild.height * 2) < 1e-6);
        assert.ok(smallChild.height < gridSettings.cellSize);
    });
    it("visual attachments expand bake bounds and facing cache keys", () => {
        const right = new WorldProp(0, 0, "boid_triangle", 0);
        const down = new WorldProp(0, 0, "boid_triangle", 0);
        right.facing = 0;
        down.facing = Math.PI / 2;
        const parentRadius = right.radius;
        assert.ok(resolveVisualAttachmentBakeRadius(right, 0) > parentRadius);
        assert.notEqual(
            getVisualAttachmentSpriteCacheKey(right, { quantizeAngleIndex }),
            getVisualAttachmentSpriteCacheKey(down, { quantizeAngleIndex }),
        );
    });
    it("boid triangle cache keys change on finer facing buckets", () => {
        const base = new WorldProp(0, 0, "boid_triangle", 0);
        const turned = new WorldProp(0, 0, "boid_triangle", 0);
        turned.facing = (Math.PI * 2) / resolvePropQuantizeSteps(turned).facing;
        assert.notEqual(getVisualAttachmentSpriteCacheKey(base, { quantizeAngleIndex }), getVisualAttachmentSpriteCacheKey(turned, { quantizeAngleIndex }));
    });
});
