import { clipToAabb, traceAabbRect } from "../../Canvas/CanvasPath.js";
/**
 * Inverse of the current canvas horizontal scale — multiply line widths, dash lengths,
 * and marker radii so they stay constant in screen pixels after `viewport.apply(ctx)`.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
export function getCanvasLineScale(ctx) {
    return 1 / Math.max(0.001, ctx.getTransform().a);
}
/** @param {import("../../Viewport/Viewport.js").Viewport} viewport @returns {import("../../Math/Aabb2D.js").Aabb2D} */
export function viewportVisibleBounds(viewport) {
    const b = viewport.boundsVisibleDefault;
    return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Math/Aabb2D.js").Aabb2D} aabb
 * @param {{ fill?: string, stroke?: string, lineWidth?: number, dash?: number[] }} [style]
 */
export function drawAabbHighlight(ctx, aabb, { fill, stroke, lineWidth = 1, dash } = {}) {
    const lineScale = getCanvasLineScale(ctx);
    const { minX, minY, maxX, maxY } = aabb;
    ctx.save();
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth * lineScale;
        if (dash?.length) ctx.setLineDash(dash.map((segment) => segment * lineScale));
        ctx.beginPath();
        traceAabbRect(ctx, aabb);
        ctx.stroke();
        if (dash?.length) ctx.setLineDash([]);
    }
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function clipToViewport(ctx, viewport) {
    clipToAabb(ctx, viewport.boundsClip);
}
