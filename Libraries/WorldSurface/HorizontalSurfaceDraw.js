/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { projectWorldPointAtHeight, projectWorldRectCorners } from "../Spatial/iso/IsometricProjection.js";

/** @returns {{ x: number, y: number }} */
export function projectHorizontalSurfaceOrigin(worldX, worldY, zLevel, viewerX, viewerY, cameraHeight) {
    return projectWorldPointAtHeight(worldX, worldY, viewerX, viewerY, zLevel, cameraHeight);
}

/** @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} */
export function projectHorizontalSurfaceCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight) {
    return projectWorldRectCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight);
}

/**
 * Union-clip ctx to the given world-axis-aligned regions.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }[]} regions
 */
export function clipToHorizontalSurfaceRegions(ctx, regions) {
    if (!regions?.length) return;
    ctx.beginPath();
    for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        ctx.rect(region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY);
    }
    ctx.clip();
}

/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function horizontalChunkIntersectsBounds(bounds, chunkOriginX, chunkOriginY, chunkSizePx) {
    return !(
        chunkOriginX + chunkSizePx < bounds.minX
        || chunkOriginX > bounds.maxX
        || chunkOriginY + chunkSizePx < bounds.minY
        || chunkOriginY > bounds.maxY
    );
}

/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }[]} regions
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function horizontalChunkIntersectsAnyRegion(regions, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!regions?.length) return true;
    for (let i = 0; i < regions.length; i++) {
        if (horizontalChunkIntersectsBounds(regions[i], chunkOriginX, chunkOriginY, chunkSizePx)) {
            return true;
        }
    }
    return false;
}
