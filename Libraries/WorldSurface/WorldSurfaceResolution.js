import { drawImageQuad } from "../Canvas/AffineTexture.js";
/** @typedef {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} WorldSurfaceSettings */
/** @param {WorldSurfaceSettings} settings */
export function getSurfaceBakeScale(settings) {
    return settings.surfaceBakeScale;
}
/** @param {number} worldSpan @param {number} surfaceBakeScale */
export function bakePixelsForWorldSpan(worldSpan, surfaceBakeScale) {
    return Math.max(1, Math.round(worldSpan * surfaceBakeScale));
}
/** @param {WorldSurfaceSettings} [settings] */
export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH, _settings) {
    if (!canvas || canvas.isPlaceholder) return;
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
}
/**
 * Blit a baked chunk onto projected horizontal corners via `drawImageQuad` (perspective-correct).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource & { width: number, height: number }} canvas
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} corners
 * @param {WorldSurfaceSettings} [settings]
 */
export function drawProjectedHorizontalChunk(ctx, canvas, corners, settings) {
    if (!canvas || canvas.isPlaceholder) return;
    const bleedPx = settings?.wallTextureBleedPx ?? 1;
    drawImageQuad(ctx, { img: canvas, sx0: 0, sy0: 0, sx1: canvas.width, sy1: canvas.height, d0: corners[0], d1: corners[1], d2: corners[2], d3: corners[3] }, { bleedPx });
}
