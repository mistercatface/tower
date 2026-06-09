/**
 * Visible-world AABB for spatial queries — matches clipToViewport / drawGround bounds.
 * Prefer {@link import("../../Viewport/Viewport.js").Viewport#boundsClip} after {@link import("../../Viewport/Viewport.js").Viewport#beginFrame}.
 *
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} padPx
 */
export function getViewQueryBounds(viewport, padPx) {
    if (padPx === 0 && viewport.boundsClip) return viewport.boundsClip;
    return viewport.getWorldBounds(undefined, undefined, padPx);
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 */
export function clipToViewport(ctx, viewport) {
    const { minX, minY, maxX, maxY } = viewport.boundsClip ?? viewport.getWorldBounds(undefined, undefined, 0);
    ctx.beginPath();
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
    ctx.clip();
}
