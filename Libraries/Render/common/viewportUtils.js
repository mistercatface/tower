/**
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} px
 * @param {number} py
 * @param {number} padPx
 */
export function getViewQueryBounds(viewport, px, py, padPx) {
    const halfW = viewport.cx / viewport.zoom;
    const halfH = viewport.cy / viewport.zoom;
    const centerX = viewport.x ?? px;
    const centerY = viewport.y ?? py;
    return { minX: centerX - halfW - padPx, minY: centerY - halfH - padPx, maxX: centerX + halfW + padPx, maxY: centerY + halfH + padPx };
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
