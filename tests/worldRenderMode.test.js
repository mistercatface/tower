import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    normalizeWorldRenderMode,
    WORLD_RENDER_MODE_DEFAULT,
    WORLD_RENDER_MODE_FLAT2D,
    WORLD_RENDER_MODE_OPTIONS,
    WORLD_RENDER_MODE_RADIAL,
    WORLD_RENDER_MODE_RADIAL_SPHERES,
} from "../Render/WorldRenderMode.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { SHAPE_TYPE_CIRCLE } from "../Libraries/Physics/physics.js";
import { Renderer } from "../Render/Render.js";
import { createMockCanvas2d } from "./mockCanvas2d.js";

describe("world render mode", () => {
    it("normalizeWorldRenderMode accepts three modes and defaults unknowns", () => {
        assert.equal(normalizeWorldRenderMode(WORLD_RENDER_MODE_FLAT2D), WORLD_RENDER_MODE_FLAT2D);
        assert.equal(normalizeWorldRenderMode(WORLD_RENDER_MODE_RADIAL_SPHERES), WORLD_RENDER_MODE_RADIAL_SPHERES);
        assert.equal(normalizeWorldRenderMode(WORLD_RENDER_MODE_RADIAL), WORLD_RENDER_MODE_RADIAL);
        assert.equal(normalizeWorldRenderMode("nope"), WORLD_RENDER_MODE_DEFAULT);
        assert.equal(normalizeWorldRenderMode(null), WORLD_RENDER_MODE_DEFAULT);
        assert.deepEqual(WORLD_RENDER_MODE_OPTIONS, [WORLD_RENDER_MODE_FLAT2D, WORLD_RENDER_MODE_RADIAL_SPHERES, WORLD_RENDER_MODE_RADIAL]);
    });
    it("radialSpheres keeps spheres radial while polygons stay flat", () => {
        const ball = new WorldProp(0, 0, "ball", 0);
        const box = new WorldProp(0, 0, "box", 0);
        assert.equal(ball.shape.shapeTypeId, SHAPE_TYPE_CIRCLE);
        assert.notEqual(box.shape.shapeTypeId, SHAPE_TYPE_CIRCLE);
        const flatProps = true;
        const radialSpheres = true;
        const flatFor = (prop) => flatProps && !(radialSpheres && prop.shape.shapeTypeId === SHAPE_TYPE_CIRCLE);
        assert.equal(flatFor(ball), false);
        assert.equal(flatFor(box), true);
    });
    it("drawWorldSceneStructure wires flat rails and radialSpheres flag", () => {
        const ctx = createMockCanvas2d(8, 8);
        const renderer = new Renderer(ctx.canvas, ctx);
        const calls = [];
        const state = {
            worldSurfaces: {
                drawFlatWallRails() {
                    calls.push("flatRails");
                },
                drawRoofs() {
                    calls.push("roofs");
                },
            },
        };
        const viewport = {};
        renderer.render3D.draw3DBuildings = (_ctx, _state, _viewport, options) => {
            calls.push(options);
        };
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_RADIAL_SPHERES);
        renderer.drawWorldSceneStructure(state, viewport);
        assert.deepEqual(calls[0], "flatRails");
        assert.deepEqual(calls[1], { skipWalls: true, flatProps: true, radialSpheres: true });
        calls.length = 0;
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_FLAT2D);
        renderer.drawWorldSceneStructure(state, viewport);
        assert.deepEqual(calls[0], "flatRails");
        assert.deepEqual(calls[1], { skipWalls: true, flatProps: true, radialSpheres: false });
        calls.length = 0;
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_RADIAL);
        renderer.drawWorldSceneStructure(state, viewport);
        assert.equal(calls[0], undefined);
        assert.equal(calls[1], "roofs");
    });
});
