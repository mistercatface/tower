/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function clipToViewport(ctx, viewport) {
    const { minX, minY, maxX, maxY } = viewport.boundsClip;
    ctx.beginPath();
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
    ctx.clip();
}
