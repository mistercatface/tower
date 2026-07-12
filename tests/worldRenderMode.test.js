import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    WORLD_RENDER_MODE_COUNT,
    WORLD_RENDER_MODE_FLAT2D,
    WORLD_RENDER_MODE_RADIAL,
    WORLD_RENDER_MODE_RADIAL_SPHERES,
    SHAPE_TYPE_CIRCLE,
} from "../Core/engineEnums.js";
import { WorldProp } from "../Libraries/Props/props.js";
import { Renderer } from "../Render/Render.js";
import { createMockCanvas2d } from "./mockCanvas2d.js";

describe("world render mode", () => {
    it("applyWorldRenderMode accepts three modes and defaults unknowns", () => {
        const ctx = createMockCanvas2d(8, 8);
        const renderer = new Renderer(ctx.canvas, ctx);
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_FLAT2D);
        assert.equal(renderer._worldRenderMode, WORLD_RENDER_MODE_FLAT2D);
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_RADIAL_SPHERES);
        assert.equal(renderer._worldRenderMode, WORLD_RENDER_MODE_RADIAL_SPHERES);
        renderer.applyWorldRenderMode(WORLD_RENDER_MODE_RADIAL);
        assert.equal(renderer._worldRenderMode, WORLD_RENDER_MODE_RADIAL);
        renderer.applyWorldRenderMode("nope");
        assert.equal(renderer._worldRenderMode, WORLD_RENDER_MODE_FLAT2D);
        renderer.applyWorldRenderMode(null);
        assert.equal(renderer._worldRenderMode, WORLD_RENDER_MODE_FLAT2D);
        assert.equal((WORLD_RENDER_MODE_RADIAL + 1) % WORLD_RENDER_MODE_COUNT, WORLD_RENDER_MODE_FLAT2D);
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
        renderer.render3D.draw3DBuildings = (_ctx, _state, _viewport, skipWalls, flatProps, radialSpheres) => {
            calls.push({ skipWalls, flatProps, radialSpheres });
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
        assert.deepEqual(calls[0], { skipWalls: undefined, flatProps: undefined, radialSpheres: undefined });
        assert.equal(calls[1], "roofs");
    });
});
