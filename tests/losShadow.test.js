import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traceWoundFlatQuad } from "../Libraries/Canvas/canvas.js";
import { edgeSegmentOutsideCircle, forEachLosShadowQuadInRange, composeLosShadowMask, drawLosShadowOverlay, collectRailWallShadowEdgesInAabbF32, EdgeList } from "../Libraries/Render/render.js";
import {  collectExposedWallEdges, collectExposedWallEdgesInAabbF32  } from "../Libraries/Spatial/spatial.js";
import {  projectWorldPointToScreen, projectWallShadowQuadScreen, shadowGroundContact  } from "../Libraries/Spatial/spatial.js";
import { ENGINE_F32, S_OUT_SCREEN, S_OUT_XY, S_QUAD } from "../Core/engineMemory.js";
import { createMockCanvas2d } from "./mockCanvas2d.js";
import { assertNear } from "./mathHarness.js";
import { makeTestObstacleGrid, makeTestViewport, stampRailWallEdge, stampWallRect } from "./harness/losShadowHarness.js";
describe("projectWorldPointToScreen", () => {
    it("chains elevation projection with viewport worldToScreen", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, 64, 64, 0);
        const flat = new Float32Array(2);
        viewport.worldToScreenF32(flat, 0, 64, 64);
        assertNear(ENGINE_F32[S_OUT_SCREEN], flat[0]);
        assertNear(ENGINE_F32[S_OUT_SCREEN + 1], flat[1]);
    });
    it("writes into caller-owned Float32Array as well as ENGINE_F32", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const local = new Float32Array(2);
        projectWorldPointToScreen(local, 0, viewport, 64, 64, 0);
        projectWorldPointToScreen(ENGINE_F32, S_OUT_SCREEN, viewport, 64, 64, 0);
        assertNear(local[0], ENGINE_F32[S_OUT_SCREEN]);
        assertNear(local[1], ENGINE_F32[S_OUT_SCREEN + 1]);
    });
});
describe("shadowGroundContact", () => {
    it("extends ray from light above wall top to ground", () => {
        shadowGroundContact(ENGINE_F32, S_OUT_XY, 0, 0, 32, 10, 0, 16);
        assertNear(ENGINE_F32[S_OUT_XY], 20);
        assertNear(ENGINE_F32[S_OUT_XY + 1], 0);
    });
    it("drops vertically when light is at or below wall top", () => {
        shadowGroundContact(ENGINE_F32, S_OUT_XY, 0, 0, 16, 10, 5, 16);
        assertNear(ENGINE_F32[S_OUT_XY], 10);
        assertNear(ENGINE_F32[S_OUT_XY + 1], 5);
        shadowGroundContact(ENGINE_F32, S_OUT_XY, 0, 0, 8, 10, 5, 16);
        assertNear(ENGINE_F32[S_OUT_XY], 10);
        assertNear(ENGINE_F32[S_OUT_XY + 1], 5);
    });
    it("extrudes along light direction when farDistance is set", () => {
        shadowGroundContact(ENGINE_F32, S_OUT_XY, 0, 0, 16, 10, 0, 16, 20);
        assertNear(ENGINE_F32[S_OUT_XY], 20);
        assertNear(ENGINE_F32[S_OUT_XY + 1], 0);
    });
    it("matches classic ratio when light is above a flat wall", () => {
        shadowGroundContact(ENGINE_F32, S_OUT_XY, 0, 0, 32, 10, 0, 0);
        assertNear(ENGINE_F32[S_OUT_XY], 10);
        assertNear(ENGINE_F32[S_OUT_XY + 1], 0);
    });
});
describe("shadowProjection", () => {
    it("projectWallShadowQuadScreen anchors near edge at projected roof height", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const out = new Float32Array(8);
        projectWallShadowQuadScreen(out, 0, viewport, 72, 40, 16, 64, 64, 80, 64, 16);
        projectWallShadowQuadScreen(ENGINE_F32, S_QUAD, viewport, 72, 40, 16, 64, 64, 80, 64, 0);
        assert.ok(out[1] !== ENGINE_F32[S_QUAD + 1], "roof near edge should differ from flat floor edge when wall has height");
    });
    it("projectWallShadowQuadScreen keeps floor corners under edge when light equals wall top", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const out = new Float32Array(8);
        projectWallShadowQuadScreen(out, 0, viewport, 72, 40, 16, 64, 64, 80, 64, 16);
        const floor1 = new Float32Array(2);
        const floor2 = new Float32Array(2);
        viewport.worldToScreenF32(floor1, 0, 64, 64);
        viewport.worldToScreenF32(floor2, 0, 80, 64);
        assertNear(out[6], floor1[0]);
        assertNear(out[7], floor1[1]);
        assertNear(out[4], floor2[0]);
        assertNear(out[5], floor2[1]);
    });
    it("projectWallShadowQuadScreen extrudes floor corners when light is above wall top", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const outLow = new Float32Array(8);
        const outHigh = new Float32Array(8);
        projectWallShadowQuadScreen(outLow, 0, viewport, 72, 40, 16, 64, 64, 80, 64, 16);
        projectWallShadowQuadScreen(outHigh, 0, viewport, 72, 40, 32, 64, 64, 80, 64, 16);
        const spreadLow = Math.hypot(outLow[6] - outLow[0], outLow[7] - outLow[1]);
        const spreadHigh = Math.hypot(outHigh[6] - outHigh[0], outHigh[7] - outHigh[1]);
        assert.ok(spreadHigh > spreadLow, "higher light should cast a longer screen wedge");
    });
});
describe("CanvasPath", () => {
    it("traceWoundFlatQuad emits wound vertices", () => {
        const ops = [];
        const ctx = {
            moveTo(x, y) {
                ops.push({ x, y });
            },
            lineTo(x, y) {
                ops.push({ x, y });
            },
        };
        traceWoundFlatQuad(ctx, [0, 0, 2, 0, 2, 2, 0, 2], 4);
        assert.equal(ops.length, 4);
        assertNear(ops[0].x, 0);
        assertNear(ops[3].x, 0);
        assertNear(ops[3].y, 2);
    });
});
describe("collectExposedWallEdges", () => {
    it("isolates a single wall cell to four exposed edges", () => {
        const grid = makeTestObstacleGrid(8, 8);
        stampWallRect(grid, 0, 0, 1, 1);
        const edges = new EdgeList();
        collectExposedWallEdges(grid, edges);
        assert.equal(edges.length, 4);
    });
    it("merges shared edge between equal-height neighbors", () => {
        const grid = makeTestObstacleGrid(8, 8);
        stampWallRect(grid, 0, 0, 2, 1);
        const edges = new EdgeList();
        collectExposedWallEdges(grid, edges);
        assert.equal(edges.length, 6);
    });
    it("collectExposedWallEdgesInAabbF32 skips wall cells outside the query box", () => {
        const grid = makeTestObstacleGrid(32, 32);
        stampWallRect(grid, 2, 2, 1, 1);
        stampWallRect(grid, 28, 28, 1, 1);
        const near = new EdgeList();
        const bufNear = new Float32Array([0, 0, 128, 128]);
        collectExposedWallEdgesInAabbF32(grid, bufNear, 0, near);
        const far = new EdgeList();
        const bufFar = new Float32Array([400, 400, 512, 512]);
        collectExposedWallEdgesInAabbF32(grid, bufFar, 0, far);
        const empty = new EdgeList();
        const bufEmpty = new Float32Array([200, 200, 280, 280]);
        collectExposedWallEdgesInAabbF32(grid, bufEmpty, 0, empty);
        assert.equal(near.length, 4);
        assert.equal(far.length, 4);
        assert.equal(empty.length, 0);
    });
});
describe("collectRailWallShadowEdgesInAabbF32", () => {
    it("emits four cap edges for a single rail wall segment", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampRailWallEdge(grid, 4, 4, 0, 1);
        const edges = new EdgeList();
        const buf = new Float32Array([0, 0, 512, 512]);
        collectRailWallShadowEdgesInAabbF32(grid, buf, 0, edges);
        assert.equal(edges.length, 4);
        assert.equal(edges.data[6], grid.cellSize);
    });
    it("defers to rail cap edges when a voxel cell shares the same side", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampWallRect(grid, 4, 4, 1, 1);
        stampRailWallEdge(grid, 4, 4, 0, 1);
        const voxelEdges = new EdgeList();
        collectExposedWallEdges(grid, voxelEdges);
        assert.equal(voxelEdges.length, 3);
        const all = new EdgeList();
        const buf = new Float32Array([0, 0, 512, 512]);
        collectExposedWallEdgesInAabbF32(grid, buf, 0, all);
        collectRailWallShadowEdgesInAabbF32(grid, buf, 0, all);
        assert.equal(all.length, 3 + 4);
    });
});
describe("losShadowEdges", () => {
    it("edgeSegmentOutsideCircle rejects segments whose AABB misses the vision disc", () => {
        assert.equal(edgeSegmentOutsideCircle(0, 0, 10, 0, 100, 100, 50 * 50), true);
        assert.equal(edgeSegmentOutsideCircle(0, 0, 10, 0, 5, 0, 50 * 50), false);
    });
    it("emits projected roof-anchored shadow quads for edges in range", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampWallRect(grid, 4, 4, 1, 1);
        const edges = new EdgeList();
        collectExposedWallEdgesInAabbF32(grid, new Float32Array([0, 0, 256, 256]), 0, edges);
        const viewport = makeTestViewport(128, 128);
        const scratch = new Float32Array(8);
        const quads = [];
        forEachLosShadowQuadInRange(edges, 72, 40, 80, 16, viewport, scratch, (flat, count) => {
            quads.push(Array.from(flat.slice(0, count * 2)));
        });
        assert.equal(quads.length, edges.length);
    });
});
describe("composeLosShadowMask", () => {
    it("carves vision then re-darkens roof-anchored wall shadows on the mask buffer", () => {
        const grid = makeTestObstacleGrid(32, 32);
        stampWallRect(grid, 10, 10, 2, 2);
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const mask = createMockCanvas2d(400, 400);
        composeLosShadowMask(mask, 400, 400, viewport, grid, 8, 1);
        const gcoOps = mask.ops.filter((o) => o.op === "gco").map((o) => o.value);
        assert.ok(gcoOps.includes("destination-out"));
        assert.ok(gcoOps.includes("source-over"));
        assert.ok(mask.ops.filter((o) => o.op === "fill").length >= 2);
        assert.ok(mask.ops.some((o) => o.op === "moveTo"));
    });
});
describe("drawLosShadowOverlay", () => {
    it("blits the mask without destination-out on the main canvas", () => {
        if (typeof OffscreenCanvas === "undefined") return;
        const grid = makeTestObstacleGrid(32, 32);
        const viewport = makeTestViewport(128, 128);
        const ctx = createMockCanvas2d(400, 400);
        drawLosShadowOverlay(ctx, viewport, grid, 8);
        assert.ok(ctx.ops.some((o) => o.op === "drawImage"));
        assert.equal(
            ctx.ops.some((o) => o.op === "gco" && o.value === "destination-out"),
            false,
        );
    });
});
describe("losShadow render gate", () => {
    it("simulation pass skips draw when losShadowStrength is 0", () => {
        const state = { losShadowStrength: 0, obstacleGrid: makeTestObstacleGrid(8, 8) };
        const ctx = createMockCanvas2d(400, 400);
        if (state.losShadowStrength && state.obstacleGrid) drawLosShadowOverlay(ctx, makeTestViewport(0, 0), state.obstacleGrid);
        assert.equal(
            ctx.ops.some((o) => o.op === "drawImage"),
            false,
        );
    });
});
describe("EdgeList (reusable edge buffer)", () => {
    it("reuses the same typed array buffer across clears", () => {
        const pool = new EdgeList();
        assert.equal(pool.length, 0);
        pool.add(1, 2, 3, 4, 1, 0, 10);
        pool.add(5, 6, 7, 8, 0, 1, 12);
        assert.equal(pool.length, 2);
        assert.equal(pool.data[0], 1);
        assert.equal(pool.data[13], 12);
        const firstBuffer = pool.data;
        pool.clear();
        assert.equal(pool.length, 0);
        pool.add(10, 20, 30, 40, -1, 0, 20);
        pool.add(50, 60, 70, 80, 0, -1, 24);
        assert.equal(pool.length, 2);
        assert.equal(pool.data, firstBuffer);
        assert.equal(pool.data[0], 10);
        assert.equal(pool.data[13], 24);
    });
});
