import { drawImageQuad } from "../Canvas/AffineTexture.js";
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
const sProjectedChunkCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
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
export function drawBakedTexture(ctx, canvas, destX, destY, destWorldW, destWorldH) {
    if (!isDrawableBakedSurface(canvas)) return;
    ctx.drawImage(canvas, destX, destY, destWorldW, destWorldH);
}
export function drawProjectedHorizontalChunk(ctx, canvas, corners) {
    if (!isDrawableBakedSurface(canvas)) return;
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, corners[0], corners[1], corners[2], corners[3]);
}
export function drawProjectedHorizontalChunkAt(ctx, canvas, originX, originY, sizePx, zLevel, viewport) {
    projectWorldAabbCornersInto(sProjectedChunkCorners, originX, originY, originX + sizePx, originY + sizePx, zLevel, viewport);
    drawProjectedHorizontalChunk(ctx, canvas, sProjectedChunkCorners);
}
