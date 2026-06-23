import { drawImageQuad } from "../Canvas/AffineTexture.js";
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
const sProjectedChunkCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/** @typedef {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} WorldSurfaceSettings */
/** @param {WorldSurfaceSettings} settings */
export function getSurfaceBakeScale(settings) {
    return settings.surfaceBakeScale;
}
/** @param {number} worldSpan @param {number} surfaceBakeScale */
export function bakePixelsForWorldSpan(worldSpan, surfaceBakeScale) {
    return Math.max(1, Math.round(worldSpan * surfaceBakeScale));
}
/** @param {CanvasImageSource & { width?: number, height?: number, isPlaceholder?: boolean } | null | undefined} canvas */
export function isDrawableBakedSurface(canvas) {
    if (!canvas || canvas.isPlaceholder) return false;
    const w = canvas.width;
    const h = canvas.height;
    return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
}
/** @param {WorldSurfaceSettings} [settings] */
export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH, _settings) {
    if (!isDrawableBakedSurface(canvas)) return;
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
    if (!isDrawableBakedSurface(canvas)) return;
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, corners[0], corners[1], corners[2], corners[3]);
}
export function drawProjectedHorizontalChunkAt(ctx, canvas, originX, originY, sizePx, zLevel, camera, settings) {
    if (!isDrawableBakedSurface(canvas)) return;
    projectWorldAabbCornersInto(sProjectedChunkCorners, originX, originY, originX + sizePx, originY + sizePx, zLevel, camera);
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, sProjectedChunkCorners[0], sProjectedChunkCorners[1], sProjectedChunkCorners[2], sProjectedChunkCorners[3]);
}
