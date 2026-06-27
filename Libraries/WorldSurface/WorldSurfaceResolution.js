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
export function drawProjectedHorizontalChunkAt(ctx, canvas, bounds, zLevel, viewport) {
    projectWorldAabbCornersInto(sProjectedChunkCorners, bounds, zLevel, viewport);
    drawImageQuad(ctx, canvas, 0, 0, canvas.width, canvas.height, sProjectedChunkCorners[0], sProjectedChunkCorners[1], sProjectedChunkCorners[2], sProjectedChunkCorners[3]);
}
