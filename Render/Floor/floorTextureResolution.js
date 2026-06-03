import { floorTileSettings } from "../../Config/Config.js";

export function getPixelsPerWorldUnit() {
    return floorTileSettings.tileResolution / floorTileSettings.tileWorldSize;
}

export function bakePixelsForWorldSpan(worldSpan) {
    return Math.max(1, Math.round(worldSpan * getPixelsPerWorldUnit()));
}

export function shouldSmoothTextureDownsample() {
    return getPixelsPerWorldUnit() > 1 && floorTileSettings.textureDownsampleSmoothing === true;
}

export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH) {
    if (!canvas || canvas.isPlaceholder) return;
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample();
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
    ctx.imageSmoothingEnabled = prevSmoothing;
}
