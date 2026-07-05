import { drawImageQuadScalars } from "../Canvas/canvas.js";
import { projectWorldAabbCornersIntoFlat } from "../Spatial/spatial.js";
const sProjectedChunkCorners = new Float32Array(8);
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
    projectWorldAabbCornersIntoFlat(sProjectedChunkCorners, bounds, zLevel, viewport);
    drawImageQuadScalars(
        ctx,
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        sProjectedChunkCorners[0],
        sProjectedChunkCorners[1],
        sProjectedChunkCorners[2],
        sProjectedChunkCorners[3],
        sProjectedChunkCorners[4],
        sProjectedChunkCorners[5],
        sProjectedChunkCorners[6],
        sProjectedChunkCorners[7],
    );
}
