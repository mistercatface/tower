import { drawImageQuad } from "../Canvas/AffineTexture.js";
/** @typedef {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} WorldSurfaceSettings */
/** @param {WorldSurfaceSettings} settings */
export function getTexelResolution(settings) {
    return settings.texelResolution;
}
/** @param {number} worldSpan @param {WorldSurfaceSettings} settings */
export function bakePixelsForWorldSpan(worldSpan, settings) {
    return Math.max(1, Math.round(worldSpan * getTexelResolution(settings)));
}
/** @param {WorldSurfaceSettings} settings */
export function shouldSmoothTextureDownsample(settings) {
    return getTexelResolution(settings) > 1;
}
/** @param {WorldSurfaceSettings} [settings] */
export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH, settings) {
    if (!canvas || canvas.isPlaceholder) return;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    if (settings) ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample(settings);
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
    ctx.imageSmoothingEnabled = prevSmoothing;
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
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, corners[0], corners[1], corners[2], corners[3], { bleedPx });
    ctx.imageSmoothingEnabled = prevSmoothing;
}
