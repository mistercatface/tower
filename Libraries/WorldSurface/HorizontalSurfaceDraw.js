/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { projectWorldPointAtHeight, projectWorldRectCorners, resolveElevationAlpha } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
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
function clipRoofsFromSpatialIndex(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, alpha) {
    if (!wallSpatialIndex) return false;
    let clippedAny = false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        const segZ = segment.wallHeight;
        if (segZ == null || Math.abs(segZ - zLevel) > 0.01) continue;
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
    return clippedAny;
}
export function clipChunkToRoofFootprints(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene = null) {
    let clippedAny = false;
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    ctx.beginPath();
    if (renderScene) {
        const minCol = worldToChunkCol(chunkOriginX, renderScene.gridMinX, renderScene.chunkSizePx);
        const maxCol = worldToChunkCol(chunkOriginX + chunkSizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
        const minRow = worldToChunkRow(chunkOriginY, renderScene.gridMinY, renderScene.chunkSizePx);
        const maxRow = worldToChunkRow(chunkOriginY + chunkSizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
        const roofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
        for (let i = 0; i < roofs.length; i++) {
            const roof = roofs[i];
            if (roof.simWall && roof.simWall.isDead) continue;
            if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
            roof.draw(ctx, null, alpha, viewerX, viewerY);
            clippedAny = true;
        }
    }
    if (!clippedAny) clippedAny = clipRoofsFromSpatialIndex(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, alpha);
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
export function drawRoofSegmentDamageOverlays(ctx, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene = null) {
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    let drewAny = false;
    if (renderScene) {
        const minCol = worldToChunkCol(chunkOriginX, renderScene.gridMinX, renderScene.chunkSizePx);
        const maxCol = worldToChunkCol(chunkOriginX + chunkSizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
        const minRow = worldToChunkRow(chunkOriginY, renderScene.gridMinY, renderScene.chunkSizePx);
        const maxRow = worldToChunkRow(chunkOriginY + chunkSizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
        const roofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
        for (let i = 0; i < roofs.length; i++) {
            const roof = roofs[i];
            if (roof.simWall && roof.simWall.isDead) continue;
            if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
            const damageAlpha = getWallDamageAlpha(roof.simWall);
            if (damageAlpha <= 0) continue;
            ctx.save();
            ctx.beginPath();
            roof.draw(ctx, null, alpha, viewerX, viewerY);
            ctx.clip();
            ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
            ctx.fill();
            ctx.restore();
            drewAny = true;
        }
    }
    if (drewAny) return;
    if (!wallSpatialIndex) return;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment.isDead) continue;
        const segZ = segment.wallHeight;
        if (segZ == null || Math.abs(segZ - zLevel) > 0.01) continue;
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
