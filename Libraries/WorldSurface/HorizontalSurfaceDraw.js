/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { projectWorldPointAtHeight, projectWorldRectCorners } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";

/** @returns {{ x: number, y: number }} */
export function projectHorizontalSurfaceOrigin(worldX, worldY, zLevel, viewerX, viewerY, cameraHeight) {
    return projectWorldPointAtHeight(worldX, worldY, viewerX, viewerY, zLevel, cameraHeight);
}

/** @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} */
export function projectHorizontalSurfaceCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight) {
    return projectWorldRectCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight);
}

/**
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
function collectWallSegmentsInChunk(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!wallSpatialIndex) return [];
    return wallSpatialIndex
        .collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx)
        .filter((segment) => !segment.isDead);
}

/**
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasWallSegments(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx) {
    return collectWallSegmentsInChunk(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx).length > 0;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} corners
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 */
function clipProjectedQuad(ctx, corners, zLevel, viewerX, viewerY, cameraHeight) {
    const projected = corners.map((corner) =>
        projectHorizontalSurfaceOrigin(corner.x, corner.y, zLevel, viewerX, viewerY, cameraHeight),
    );
    ctx.moveTo(projected[0].x, projected[0].y);
    ctx.lineTo(projected[1].x, projected[1].y);
    ctx.lineTo(projected[2].x, projected[2].y);
    ctx.lineTo(projected[3].x, projected[3].y);
    ctx.closePath();
}

/**
 * Clip draw to projected wall-segment footprints at roof elevation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @returns {boolean}
 */
export function clipChunkToRoofFootprints(
    ctx,
    wallSpatialIndex,
    chunkOriginX,
    chunkOriginY,
    chunkSizePx,
    zLevel,
    viewerX,
    viewerY,
    cameraHeight,
) {
    const segments = collectWallSegmentsInChunk(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx);
    if (!segments.length) return false;

    ctx.beginPath();
    for (const segment of segments) {
        clipProjectedQuad(ctx, getSegmentFootprintCorners(segment), zLevel, viewerX, viewerY, cameraHeight);
    }
    ctx.clip();
    return true;
}
