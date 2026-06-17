import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectLosShadowEdges, forEachLosShadowQuadInRange } from "../Libraries/Render/Lighting/losShadowEdges.js";
import { composeLosShadowMask, drawLosShadowOverlay } from "../Libraries/Render/Lighting/losShadowOverlay.js";
import { isLosShadowStructureMode } from "../Libraries/Render/Lighting/losShadowDefaults.js";
import {
    appendShadowQuadToPath,
    edgeNormalFacesLight,
    projectWallShadowQuadScreenInto,
    shadowExtrusionRatio,
    shadowFloorTip,
} from "../Libraries/Render/Lighting/losShadowMath.js";
import { createMockCanvas2d, makeTestCamera, makeTestObstacleGrid, makeTestViewport, stampWallRect } from "./losShadowHarness.js";
import { assertNear } from "./mathHarness.js";
describe("losShadowMath", () => {
    it("shadowExtrusionRatio uses long extrusion when light is at or below wall top", () => {
        assert.equal(shadowExtrusionRatio(16, 16), 100);
        assert.equal(shadowExtrusionRatio(8, 16), 100);
        assertNear(shadowExtrusionRatio(32, 16), 2);
        assertNear(shadowExtrusionRatio(32, 0), 1);
    });
    it("projectWallShadowQuadScreenInto anchors near edge at projected roof height", () => {
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const camera = makeTestCamera(128, 128, 160, 1);
        const out = new Float32Array(8);
        projectWallShadowQuadScreenInto(out, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 16);
        const outFlat = new Float32Array(8);
        projectWallShadowQuadScreenInto(outFlat, viewport, camera, 72, 40, 16, 64, 64, 80, 64, 0);
        assert.ok(out[1] !== outFlat[1], "roof near edge should differ from flat floor edge when wall has height");
    });
    it("shadowFloorTip extrudes from light through ground corner", () => {
        const tip = shadowFloorTip(0, 0, 10, 0, 2);
        assertNear(tip.x, 20);
        assertNear(tip.y, 0);
    });
    it("edgeNormalFacesLight rejects back-facing edges", () => {
        assert.equal(edgeNormalFacesLight(0, 1, 8, 12, 8, 8), true);
        assert.equal(edgeNormalFacesLight(0, -1, 8, 4, 8, 8), true);
        assert.equal(edgeNormalFacesLight(0, 1, 8, 4, 8, 8), false);
    });
    it("appendShadowQuadToPath emits wound vertices", () => {
        const ops = [];
        const ctx = {
            moveTo(x, y) {
                ops.push({ x, y });
            },
            lineTo(x, y) {
                ops.push({ x, y });
            },
        };
        appendShadowQuadToPath(ctx, [0, 0, 2, 0, 2, 2, 0, 2], 4);
        assert.equal(ops.length, 4);
        assertNear(ops[0].x, 0);
        assertNear(ops[3].x, 0);
        assertNear(ops[3].y, 2);
    });
});
describe("losShadowEdges", () => {
    it("isolates a single wall cell to four exposed edges", () => {
        const grid = makeTestObstacleGrid(8, 8);
        stampWallRect(grid, 0, 0, 1, 1);
        const edges = [];
        collectLosShadowEdges(grid, edges);
        assert.equal(edges.length, 4);
    });
    it("merges shared edge between equal-height neighbors", () => {
        const grid = makeTestObstacleGrid(8, 8);
        stampWallRect(grid, 0, 0, 2, 1);
        const edges = [];
        collectLosShadowEdges(grid, edges);
        assert.equal(edges.length, 6);
    });
    it("emits projected roof-anchored shadow quads for edges facing the light", () => {
        const grid = makeTestObstacleGrid(16, 16);
        stampWallRect(grid, 4, 4, 1, 1);
        const edges = [];
        collectLosShadowEdges(grid, edges);
        const viewport = makeTestViewport(128, 128);
        const camera = makeTestCamera(128, 128);
        const scratch = new Float32Array(8);
        const quads = [];
        forEachLosShadowQuadInRange(edges, 72, 40, 80, 16, viewport, camera, scratch, (flat, count) => {
            quads.push(Array.from(flat.slice(0, count * 2)));
        });
        assert.ok(quads.length >= 1);
        assert.ok(quads.length < edges.length);
    });
});
describe("isLosShadowStructureMode", () => {
    it("reads editor flag or root losShadowMode", () => {
        assert.equal(isLosShadowStructureMode({ editor: { losShadowActive: true } }), true);
        assert.equal(isLosShadowStructureMode({ losShadowMode: true }), true);
        assert.equal(isLosShadowStructureMode({ editor: { losShadowActive: false } }), false);
    });
});
describe("composeLosShadowMask", () => {
    it("carves vision then re-darkens roof-anchored wall shadows on the mask buffer", () => {
        const grid = makeTestObstacleGrid(32, 32);
        stampWallRect(grid, 10, 10, 2, 2);
        const viewport = makeTestViewport(128, 128, 200, 200, 1);
        const mask = createMockCanvas2d(400, 400);
        composeLosShadowMask(mask, 400, 400, viewport, grid, {
            visionTiles: 8,
            lightHeightCells: 1,
            camera: makeTestCamera(128, 128),
        });
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
        assert.equal(ctx.ops.some((o) => o.op === "gco" && o.value === "destination-out"), false);
    });
});
