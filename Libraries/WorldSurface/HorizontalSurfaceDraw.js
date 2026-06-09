/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { projectWorldPointAtHeight, projectWorldRectCorners, resolveElevationAlpha } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { getWallDamageAlpha, wallDamageOverlayStyle } from "../Render/Structure3D/wallDamageVisual.js";
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
export function chunkHasWallSegments(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) if (!segments[i].isDead) return true;
    return false;
}
/**
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {number} defaultWallHeight
 */
export function chunkHasWallSegmentsAtZ(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, defaultWallHeight) {
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        const segZ = segment.wallHeight ?? defaultWallHeight;
        if (Math.abs(segZ - zLevel) <= 0.01) return true;
    }
    return false;
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
export function clipChunkToRoofFootprints(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, defaultWallHeight) {
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    let clippedAny = false;
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    ctx.beginPath();
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        const segZ = segment.wallHeight ?? defaultWallHeight;
        if (Math.abs(segZ - zLevel) > 0.01) continue;
        const corners = getSegmentFootprintCorners(segment);
        for (let j = 0; j < 4; j++) {
            const corner = corners[j];
            const px = corner.x + (corner.x - viewerX) * alpha;
            const py = corner.y + (corner.y - viewerY) * alpha;
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        clippedAny = true;
    }
    if (!clippedAny) return false;
    ctx.clip();
    return true;
}
/**
 * Per-wall roof damage tint — same health → overlay mapping as projected wall faces.
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
 * @param {number} defaultWallHeight
 */
export function drawRoofSegmentDamageOverlays(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, defaultWallHeight) {
    if (!wallSpatialIndex) return;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        const segZ = segment.wallHeight ?? defaultWallHeight;
        if (Math.abs(segZ - zLevel) > 0.01) continue;
        const damageAlpha = getWallDamageAlpha(segment);
        if (damageAlpha <= 0) continue;
        const corners = getSegmentFootprintCorners(segment);
        ctx.save();
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
            const corner = corners[j];
            const px = corner.x + (corner.x - viewerX) * alpha;
            const py = corner.y + (corner.y - viewerY) * alpha;
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
        ctx.fill();
        ctx.restore();
    }
}
