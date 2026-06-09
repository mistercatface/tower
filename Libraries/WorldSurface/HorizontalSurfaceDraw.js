/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { projectWorldPointAtHeight, projectWorldRectCorners, resolveElevationAlpha } from "../Spatial/iso/IsometricProjection.js";
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
 * Clip draw to retained roof-cap footprints at the given elevation.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {import("../Render/Scene/RenderScene.js").RenderScene | null | undefined} renderScene
 * @returns {boolean}
 */
export function clipChunkToRoofFootprints(ctx, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene) {
    if (!renderScene) return false;
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    const minCol = worldToChunkCol(chunkOriginX, renderScene.gridMinX, renderScene.chunkSizePx);
    const maxCol = worldToChunkCol(chunkOriginX + chunkSizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
    const minRow = worldToChunkRow(chunkOriginY, renderScene.gridMinY, renderScene.chunkSizePx);
    const maxRow = worldToChunkRow(chunkOriginY + chunkSizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
    const roofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
    ctx.beginPath();
    let clippedAny = false;
    for (let i = 0; i < roofs.length; i++) {
        const roof = roofs[i];
        if (roof.simWall?.isDead) continue;
        if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
        roof.draw(ctx, null, alpha, viewerX, viewerY);
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
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {import("../Render/Scene/RenderScene.js").RenderScene | null | undefined} renderScene
 */
export function drawRoofSegmentDamageOverlays(ctx, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene) {
    if (!renderScene) return;
    const alpha = resolveElevationAlpha(zLevel, cameraHeight, 1);
    const minCol = worldToChunkCol(chunkOriginX, renderScene.gridMinX, renderScene.chunkSizePx);
    const maxCol = worldToChunkCol(chunkOriginX + chunkSizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
    const minRow = worldToChunkRow(chunkOriginY, renderScene.gridMinY, renderScene.chunkSizePx);
    const maxRow = worldToChunkRow(chunkOriginY + chunkSizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
    const roofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
    for (let i = 0; i < roofs.length; i++) {
        const roof = roofs[i];
        if (roof.simWall?.isDead) continue;
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
    }
}
