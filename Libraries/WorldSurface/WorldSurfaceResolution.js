import { getWorldSurfaceSettings } from "./WorldSurfaceSettings.js";

export function getPixelsPerWorldUnit(settings = getWorldSurfaceSettings()) {
    return settings.tileResolution / settings.tileWorldSize;
}

export function bakePixelsForWorldSpan(worldSpan, settings = getWorldSurfaceSettings()) {
    return Math.max(1, Math.round(worldSpan * getPixelsPerWorldUnit(settings)));
}

export function shouldSmoothTextureDownsample(settings = getWorldSurfaceSettings()) {
    return getPixelsPerWorldUnit(settings) > 1;
}

export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH) {
    if (!canvas || canvas.isPlaceholder) return;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample();
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
    ctx.imageSmoothingEnabled = prevSmoothing;
}
