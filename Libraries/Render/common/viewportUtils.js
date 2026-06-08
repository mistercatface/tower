/**
 * Visible-world AABB for spatial queries — matches clipToViewport / drawGround bounds.
 *
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} padPx
 * @param {{ width: number, height: number } | null | undefined} [canvasBounds]
 */
export function getViewQueryBounds(viewport, padPx, canvasBounds = null) {
    const screenW = canvasBounds?.width ?? viewport.cx * 2;
    const screenH = canvasBounds?.height ?? viewport.cy * 2;
    return viewport.getWorldBounds(screenW, screenH, padPx);
}
export function alignBoundsToHash(bounds, cellSize) {
    return {
        minX: Math.floor(bounds.minX / cellSize) * cellSize,
        minY: Math.floor(bounds.minY / cellSize) * cellSize,
        maxX: Math.ceil(bounds.maxX / cellSize) * cellSize,
        maxY: Math.ceil(bounds.maxY / cellSize) * cellSize,
    };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {{ width: number, height: number }|null} canvasBounds
 */
export function clipToViewport(ctx, viewport, canvasBounds) {
    const screenW = canvasBounds?.width ?? viewport.cx * 2;
    const screenH = canvasBounds?.height ?? viewport.cy * 2;
    const { minX, minY, maxX, maxY } = viewport.getWorldBounds(screenW, screenH, 0);
    ctx.beginPath();
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
    ctx.clip();
}
