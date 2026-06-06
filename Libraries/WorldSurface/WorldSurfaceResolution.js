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
