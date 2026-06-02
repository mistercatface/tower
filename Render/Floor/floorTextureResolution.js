import { floorTileSettings } from "../../Config/Config.js";

export function getTexturePixelsPerWorldUnit() {
    const scale = floorTileSettings.texturePixelsPerWorldUnit;
    if (!Number.isFinite(scale) || scale < 1) {
        throw new Error(`floorTileSettings.texturePixelsPerWorldUnit must be >= 1, got ${scale}`);
    }
    return Math.floor(scale);
}

export function bakePixelsForWorldSpan(worldSpan) {
    return Math.max(1, Math.ceil(worldSpan * getTexturePixelsPerWorldUnit()));
}

export function shouldSmoothTextureDownsample() {
    return getTexturePixelsPerWorldUnit() > 1 && floorTileSettings.textureDownsampleSmoothing === true;
}

export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH) {
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = shouldSmoothTextureDownsample();
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
    ctx.imageSmoothingEnabled = prevSmoothing;
}
