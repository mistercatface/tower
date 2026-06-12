/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { resolveStructurePerspectiveStrength } from "../../Core/GamePerspective.js";
import { projectWorldPointAtHeight } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { getWallDamageAlpha, wallDamageOverlayStyle } from "../Render/Structure3D/wallDamageVisual.js";
/** @returns {{ x: number, y: number }} */
export function projectHorizontalSurfaceOrigin(worldX, worldY, zLevel, viewerX, viewerY, cameraHeight, viewport = null) {
    const strength = resolveStructurePerspectiveStrength(viewport);
    return projectWorldPointAtHeight(worldX, worldY, viewerX, viewerY, zLevel, cameraHeight, strength);
}
/** @returns {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} */
export function projectHorizontalSurfaceCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight, viewport = null) {
    const strength = resolveStructurePerspectiveStrength(viewport);
    return [
        projectWorldPointAtHeight(originX, originY, viewerX, viewerY, zLevel, cameraHeight, strength),
        projectWorldPointAtHeight(originX + sizePx, originY, viewerX, viewerY, zLevel, cameraHeight, strength),
        projectWorldPointAtHeight(originX + sizePx, originY + sizePx, viewerX, viewerY, zLevel, cameraHeight, strength),
        projectWorldPointAtHeight(originX, originY + sizePx, viewerX, viewerY, zLevel, cameraHeight, strength),
    ];
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
 * @param {import("../Viewport/Viewport.js").Viewport | null | undefined} [viewport]
 * @returns {boolean}
 */
export function clipChunkToRoofFootprints(ctx, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene, viewport = null) {
    if (!renderScene) return false;
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
        roof.draw(ctx, viewport, cameraHeight, viewerX, viewerY);
        clippedAny = true;
    }
    if (!clippedAny) return false;
    ctx.clip();
    return true;
}
/**
 * Clip draw to wall segment footprints in a chunk (flat 2D rail caps).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @returns {boolean}
 */
export function clipChunkToWallFootprints(ctx, chunkOriginX, chunkOriginY, chunkSizePx, wallSpatialIndex) {
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    ctx.beginPath();
    let clippedAny = false;
    for (let i = 0; i < segments.length; i++) {
        const wall = segments[i];
        if (wall.isDead || wall.collisionOnly) continue;
        const corners = getSegmentFootprintCorners(wall);
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let j = 1; j < corners.length; j++) ctx.lineTo(corners[j].x, corners[j].y);
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
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {import("../Render/Scene/RenderScene.js").RenderScene | null | undefined} renderScene
 * @param {import("../Viewport/Viewport.js").Viewport | null | undefined} [viewport]
 */
export function drawRoofSegmentDamageOverlays(ctx, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, viewerX, viewerY, cameraHeight, renderScene, viewport = null) {
    if (!renderScene) return;
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
        roof.draw(ctx, viewport, cameraHeight, viewerX, viewerY);
        ctx.clip();
        ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
        ctx.fill();
        ctx.restore();
    }
}
/**
 * Per-wall damage tint for flat 2D rail caps — same overlay as projected wall faces.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 */
export function drawWallFootprintDamageOverlays(ctx, chunkOriginX, chunkOriginY, chunkSizePx, wallSpatialIndex) {
    if (!wallSpatialIndex) return;
    const segments = wallSpatialIndex.collectInBounds(chunkOriginX, chunkOriginY, chunkOriginX + chunkSizePx, chunkOriginY + chunkSizePx);
    for (let i = 0; i < segments.length; i++) {
        const wall = segments[i];
        if (wall.isDead || wall.collisionOnly) continue;
        const damageAlpha = getWallDamageAlpha(wall);
        if (damageAlpha <= 0) continue;
        const corners = getSegmentFootprintCorners(wall);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let j = 1; j < corners.length; j++) ctx.lineTo(corners[j].x, corners[j].y);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
        ctx.fill();
        ctx.restore();
    }
}
