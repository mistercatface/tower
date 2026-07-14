import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { applyPropBoxFootprint, getBaseSpriteCacheId, getPropStageBakeState, entityFootprintHalfExtentsInto, resolvePropQuantizeSteps, invalidateEntityFootprint } from "../Libraries/Props/props.js";
import { setCirclePropRadius } from "../Libraries/Props/props.js";
import { createWallChunkDraw, bindWallChunkTexturePipeline } from "../Libraries/Render/render.js";
import { kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { quantizeAngleIndex, quantizeAngle } from "../Libraries/Math/math.js";
import { SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENGINE_F32, M_VEC_A } from "../Core/engineMemory.js";
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_PERSPECTIVE_STRENGTH } from "../Libraries/Viewport/Viewport.js";
import propCatalog from "../Assets/props/index.js";
import { gridSettings } from "../Config/world.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
const cacheKeyDeps = { quantizeAngleIndex };
let nextStageEid = 9000;
function bindStageProp(prop) {
    assignPhysIdWithPose(prop, nextStageEid++);
    return prop._physId;
}
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
        bindStageProp(hex);
        bindStageProp(wedge);
        const hexKey = getBaseSpriteCacheId(hex._physId, cacheKeyDeps);
        const wedgeKey = getBaseSpriteCacheId(wedge._physId, cacheKeyDeps);
        assert.notEqual(hexKey, wedgeKey);
    });
    it("resized custom box changes sprite cache footprint bucket", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        bindStageProp(prop);
        const before = getBaseSpriteCacheId(prop._physId, cacheKeyDeps);
        applyPropBoxFootprint(prop, 12, 5);
        invalidateEntityFootprint(prop._physId);
        const after = getBaseSpriteCacheId(prop._physId, cacheKeyDeps);
        assert.notEqual(before, after);
        assert.equal(typeof after, "number");
    });
    it("sprite bake stage passes live polygon verts to draw", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        const eid = bindStageProp(prop);
        const stageProp = getPropStageBakeState(eid);
        assert.equal(stageProp.shape.vertices.length / 2, 6);
        assert.equal(stageProp.shape.vertices[0], prop.shape.vertices[0]);
        entityFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, eid);
        assert.equal(stageProp.halfExtents.x, ENGINE_F32[M_VEC_A]);
    });
    it("polygon primitive fills flat silhouette in 2d from live shape", () => {
        const prop = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(prop, 12, 5);
        assert.equal(prop.wallChunkProfileId, "poolTableFelt");
        prop._wallChunkTextureReady = true;
        bindWallChunkTexturePipeline({
            _wallChunkReady: true,
            _wallChunkCapCanvas: { width: 128, height: 128 },
            _wallChunkSideCanvas: { width: 128, height: 128 },
            settings: { surfaceBakeScale: 1, cellSize: 16, cellsPerChunk: 8 },
        });
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
            createPattern() { return { setTransform() {} }; },
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
        bindWallChunkTexturePipeline(null);
    });
    it("textured flat wall-chunk cap fills live polygon path (not clip+triangle quad)", () => {
        const prop = new WorldProp(0, 0, "hex_block", 0);
        prop._wallChunkTextureReady = true;
        bindWallChunkTexturePipeline({
            _wallChunkReady: true,
            _wallChunkCapCanvas: { width: 128, height: 128 },
            _wallChunkSideCanvas: { width: 128, height: 128 },
            settings: { surfaceBakeScale: 1, cellSize: 16, cellsPerChunk: 8 },
        });
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
        bindWallChunkTexturePipeline(null);
    });
    it("polygon primitive skips radial draw until wall-chunk textures are ready", () => {
        bindWallChunkTexturePipeline(null);
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
        assert.equal(calls.fill, 0);
        assert.equal(calls.stroke, 0);
    });
    it("large footprints use finer sprite facing steps than crate-sized props", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        const plank = new WorldProp(0, 0, "box", 0);
        applyPropBoxFootprint(plank, 64, 8);
        const crateEid = bindStageProp(crate);
        const plankEid = bindStageProp(plank);
        assert.equal(resolvePropQuantizeSteps(crateEid).facing, 16);
        assert.equal(resolvePropQuantizeSteps(plankEid).facing, 360);
    });
    it("boid triangle uses finer facing quantization through its prop strategy", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        const triangle = new WorldProp(0, 0, "boid_triangle", 0);
        const crateEid = bindStageProp(crate);
        const triangleEid = bindStageProp(triangle);
        assert.equal(resolvePropQuantizeSteps(crateEid).facing, 16);
        assert.equal(resolvePropQuantizeSteps(triangleEid).facing, 64);
    });
});
