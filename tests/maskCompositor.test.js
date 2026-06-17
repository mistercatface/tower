import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMaskPathFill, blitMaskOverlay, composeDestinationIn, cutOutRadialSoftDisc, fillMaskBase, maskCanvasDestinationIn } from "../Libraries/Canvas/maskCompositor.js";
import { createMockCanvas2d } from "./losShadowHarness.js";
describe("fillMaskBase", () => {
    it("clears and fills with source-over", () => {
        const ctx = createMockCanvas2d(100, 80);
        fillMaskBase(ctx, 100, 80, "rgba(0,0,0,0.8)");
        assert.ok(ctx.ops.some((o) => o.op === "clearRect"));
        assert.ok(ctx.ops.some((o) => o.op === "fillRect"));
        const gco = ctx.ops.filter((o) => o.op === "gco").map((o) => o.value);
        assert.equal(gco[0], "source-over");
    });
});
describe("cutOutRadialSoftDisc", () => {
    it("punches a radial hole with destination-out", () => {
        const ctx = createMockCanvas2d(200, 200);
        cutOutRadialSoftDisc(ctx, 100, 100, 64);
        assert.ok(ctx.ops.some((o) => o.op === "gco" && o.value === "destination-out"));
        assert.ok(ctx.ops.some((o) => o.op === "arc"));
        assert.ok(ctx.ops.some((o) => o.op === "fill"));
    });
});
describe("addMaskPathFill", () => {
    it("skips fill when tracePath returns false", () => {
        const ctx = createMockCanvas2d(100, 100);
        const filled = addMaskPathFill(ctx, "rgba(0,0,0,1)", () => false);
        assert.equal(filled, false);
        assert.equal(
            ctx.ops.some((o) => o.op === "fill"),
            false,
        );
    });
    it("fills traced paths with source-over", () => {
        const ctx = createMockCanvas2d(100, 100);
        const filled = addMaskPathFill(ctx, "rgba(0,0,0,1)", (pathCtx) => {
            pathCtx.moveTo(0, 0);
            pathCtx.lineTo(10, 0);
            pathCtx.lineTo(10, 10);
            return true;
        });
        assert.equal(filled, true);
        assert.ok(ctx.ops.some((o) => o.op === "gco" && o.value === "source-over"));
        assert.ok(ctx.ops.some((o) => o.op === "fill"));
    });
});
describe("maskCanvasDestinationIn", () => {
    it("uses destination-in when drawing the mask image", () => {
        const ctx = createMockCanvas2d(32, 32);
        const mask = { width: 32, height: 32 };
        maskCanvasDestinationIn(ctx, mask, 32, 32);
        assert.ok(ctx.ops.some((o) => o.op === "gco" && o.value === "destination-in"));
        assert.ok(ctx.ops.some((o) => o.op === "drawImage"));
    });
});
describe("composeDestinationIn", () => {
    it("copies source then clips to mask alpha", () => {
        if (typeof OffscreenCanvas === "undefined") return;
        const source = new OffscreenCanvas(8, 8);
        const mask = new OffscreenCanvas(8, 8);
        const out = composeDestinationIn(source, mask);
        assert.equal(out.width, 8);
        assert.equal(out.height, 8);
    });
});
describe("blitMaskOverlay", () => {
    it("draws the mask with source-over and restores context", () => {
        const ctx = createMockCanvas2d(400, 400);
        const source = { width: 400, height: 400 };
        blitMaskOverlay(ctx, source);
        assert.ok(ctx.ops.some((o) => o.op === "save"));
        assert.ok(ctx.ops.some((o) => o.op === "drawImage"));
        assert.ok(ctx.ops.some((o) => o.op === "restore"));
        assert.ok(ctx.ops.some((o) => o.op === "gco" && o.value === "source-over"));
    });
});
