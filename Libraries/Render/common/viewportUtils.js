import { clipToAabb } from "../../Canvas/CanvasPath.js";
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function clipToViewport(ctx, viewport) {
    clipToAabb(ctx, viewport.boundsClip);
}
