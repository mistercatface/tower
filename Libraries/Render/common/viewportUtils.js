import { clipToAabb } from "../../Canvas/CanvasPath.js";
/**
 * Inverse of the current canvas horizontal scale — multiply line widths, dash lengths,
 * and marker radii so they stay constant in screen pixels after `viewport.apply(ctx)`.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
export function getCanvasLineScale(ctx) {
    return 1 / Math.max(0.001, ctx.getTransform().a);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function clipToViewport(ctx, viewport) {
    clipToAabb(ctx, viewport.boundsClip);
}
