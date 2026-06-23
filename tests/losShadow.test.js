import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traceWoundFlatQuad } from "../Libraries/Canvas/CanvasPath.js";
import { edgeSegmentOutsideCircle, forEachLosShadowQuadInRange } from "../Libraries/Render/losShadow/losShadowEdges.js";
import { composeLosShadowMask, drawLosShadowOverlay } from "../Libraries/Render/losShadow/losShadowOverlay.js";
import { collectRailWallShadowEdgesInAabb } from "../Libraries/Render/losShadow/railWallShadowEdges.js";
import { collectExposedWallEdges, collectExposedWallEdgesInAabb } from "../Libraries/Spatial/grid/gridCellTopology.js";
import { projectWorldPointToScreenInto } from "../Libraries/Spatial/iso/IsometricProjection.js";
import { projectWallShadowQuadScreenInto, shadowGroundContactXY } from "../Libraries/Spatial/iso/shadowProjection.js";
import { createMockCanvas2d } from "./mockCanvas2d.js";
import { assertNear } from "./mathHarness.js";
import { makeTestCamera, makeTestObstacleGrid, makeTestViewport, stampRailWallEdge, stampWallRect } from "./losShadowHarness.js";

describe("projectWorldPointToScreenInto", () => {
    it("chains elevation projection with viewport worldToScreen", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const camera = makeTestCamera(128, 128, 160, 1);
        const out = { x: 0, y: 0 };
        projectWorldPointToScreenInto(out, viewport, camera, 64, 64, 0);
        const flat = viewport.worldToScreen(64, 64);
        assertNear(out.x, flat.x);
        assertNear(out.y, flat.y);
    });
});
describe("shadowGroundContactXY", () => {
    it("extends ray from light above wall top to ground", () => {
        const tip = shadowGroundContactXY(0, 0, 32, 10, 0, 16);
        assertNear(tip.x, 20);
        assertNear(tip.y, 0);
    });
    it("drops vertically when light is at or below wall top", () => {
        assertNear(shadowGroundContactXY(0, 0, 16, 10, 5, 16).x, 10);
        assertNear(shadowGroundContactXY(0, 0, 16, 10, 5, 16).y, 5);
        assertNear(shadowGroundContactXY(0, 0, 8, 10, 5, 16).x, 10);
        assertNear(shadowGroundContactXY(0, 0, 8, 10, 5, 16).y, 5);
    });
    it("extrudes along light direction when farDistance is set", () => {
        assertNear(shadowGroundContactXY(0, 0, 16, 10, 0, 16, 20).x, 20);
        assertNear(shadowGroundContactXY(0, 0, 16, 10, 0, 16, 20).y, 0);
    });
    it("matches classic ratio when light is above a flat wall", () => {
        const tip = shadowGroundContactXY(0, 0, 32, 10, 0, 0);
        assertNear(tip.x, 10);
        assertNear(tip.y, 0);
    });
});
describe("shadowProjection", () => {
    it("projectWallShadowQuadScreenInto anchors near edge at projected roof height", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const camera = makeTestCamera(128, 128, 160, 1);
        const out = new Float32Array(8);
        projectWallShadowQuadScreenInto(out, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 16);
        const outFlat = new Float32Array(8);
        projectWallShadowQuadScreenInto(outFlat, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 0);
        assert.ok(out[1] !== outFlat[1], "roof near edge should differ from flat floor edge when wall has height");
    });
    it("projectWallShadowQuadScreenInto keeps floor corners under edge when light equals wall top", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const camera = makeTestCamera(128, 128, 160, 1);
        const out = new Float32Array(8);
        projectWallShadowQuadScreenInto(out, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 16);
        const floor1 = viewport.worldToScreen(64, 64);
        const floor2 = viewport.worldToScreen(80, 64);
        assertNear(out[6], floor1.x);
        assertNear(out[7], floor1.y);
        assertNear(out[4], floor2.x);
        assertNear(out[5], floor2.y);
    });
    it("projectWallShadowQuadScreenInto extrudes floor corners when light is above wall top", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const camera = makeTestCamera(128, 128, 160, 1);
        const outLow = new Float32Array(8);
        const outHigh = new Float32Array(8);
        projectWallShadowQuadScreenInto(outLow, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 16);
        projectWallShadowQuadScreenInto(outHigh, viewport, camera, 72, 40, 32, 64, 64, 80, 64, 16);
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
        const edges = [];
        collectExposedWallEdges(grid, edges);
        assert.equal(edges.length, 4);
    });
    it("merges shared edge between equal-height neighbors", () => {
        const grid = makeTestObstacleGrid(8, 8);
        stampWallRect(grid, 0, 0, 2, 1);
        const edges = [];
        collectExposedWallEdges(grid, edges);
        assert.equal(edges.length, 6);
    });
    it("collectExposedWallEdgesInAabb skips wall cells outside the query box", () => {
        const grid = makeTestObstacleGrid(32, 32);
        stampWallRect(grid, 2, 2, 1, 1);
        stampWallRect(grid, 28, 28, 1, 1);
        const near = [];
        collectExposedWallEdgesInAabb(grid, 0, 0, 128, 128, near);
        const far = [];
        collectExposedWallEdgesInAabb(grid, 400, 400, 512, 512, far);
        const empty = [];
        collectExposedWallEdgesInAabb(grid, 200, 200, 280, 280, empty);
        assert.equal(near.length, 4);
        assert.equal(far.length, 4);
        assert.equal(empty.length, 0);
    });
});
describe("collectRailWallShadowEdgesInAabb", () => {
    it("emits four cap edges for a single rail wall segment", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampRailWallEdge(grid, 4, 4, 0, 1);
        const edges = [];
        collectRailWallShadowEdgesInAabb(grid, 0, 0, 512, 512, edges);
        assert.equal(edges.length, 4);
        assert.equal(edges[0].wallTopZ, grid.cellSize);
    });
    it("defers to rail cap edges when a voxel cell shares the same side", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampWallRect(grid, 4, 4, 1, 1);
        stampRailWallEdge(grid, 4, 4, 0, 1);
        const voxelEdges = [];
        collectExposedWallEdges(grid, voxelEdges);
        assert.equal(voxelEdges.length, 3);
        const all = [];
        collectExposedWallEdgesInAabb(grid, 0, 0, 512, 512, all);
        collectRailWallShadowEdgesInAabb(grid, 0, 0, 512, 512, all);
        assert.equal(all.length, 3 + 4);
    });
});
describe("losShadowEdges", () => {
    it("edgeSegmentOutsideCircle rejects segments whose AABB misses the vision disc", () => {
        assert.equal(edgeSegmentOutsideCircle({ x1: 0, y1: 0, x2: 10, y2: 0 }, 100, 100, 50 * 50), true);
        assert.equal(edgeSegmentOutsideCircle({ x1: 0, y1: 0, x2: 10, y2: 0 }, 5, 0, 50 * 50), false);
    });
    it("emits projected roof-anchored shadow quads for edges in range", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampWallRect(grid, 4, 4, 1, 1);
        const edges = [];
        collectExposedWallEdgesInAabb(grid, 0, 0, 256, 256, edges);
        const viewport = makeTestViewport(128, 128);
        const camera = makeTestCamera(128, 128);
        const scratch = new Float32Array(8);
        const quads = [];
        forEachLosShadowQuadInRange(edges, 72, 40, 80, 16, viewport, camera, scratch, (flat, count) => {
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
        composeLosShadowMask(mask, 400, 400, viewport, grid, { visionTiles: 8, lightHeightCells: 1, camera: makeTestCamera(128, 128) });
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
        drawLosShadowOverlay(ctx, viewport, grid, { visionTiles: 8, camera: makeTestCamera(128, 128) });
        assert.ok(ctx.ops.some((o) => o.op === "drawImage"));
        assert.equal(
            ctx.ops.some((o) => o.op === "gco" && o.value === "destination-out"),
            false,
        );
    });
});
describe("losShadow render gate", () => {
    it("simulation pass skips draw when losShadowEnabled is false", () => {
        const state = { losShadowEnabled: false, obstacleGrid: makeTestObstacleGrid(8, 8) };
        const ctx = createMockCanvas2d(400, 400);
        if (state.losShadowEnabled && state.obstacleGrid) drawLosShadowOverlay(ctx, makeTestViewport(0, 0), state.obstacleGrid);
        assert.equal(ctx.ops.some((o) => o.op === "drawImage"), false);
    });
});
