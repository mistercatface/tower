/**
 * World-aligned horizontal surface chunks (ground z=0, elevated roofs z>0).
 */
import { resolveStructurePerspectiveStrength } from "../../Core/GamePerspective.js";
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, traceClosedPolygon, clipToPath } from "../Canvas/CanvasPath.js";
import { worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { getDamageAlphaFromHealth, drawAabbDamageOverlay, drawDamageOverlayInClip, drawPolygonDamageOverlay } from "../Render/Structure3D/wallDamageVisual.js";
import { resolveStaticWallHeightAtCell, cellIsStaticBlocked } from "../World/staticOccupancyLayers.js";
import { getStaticCellDamageAlphaAtGrid } from "../World/staticCellDamage.js";
import { bakePixelsForWorldSpan } from "./WorldSurfaceResolution.js";
const sHorizontalCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/**
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} out4
 * @returns {typeof out4}
 */
export function projectHorizontalSurfaceCornersInto(out4, originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight, viewport = null) {
    const strength = resolveStructurePerspectiveStrength(viewport);
    return projectWorldAabbCornersInto(out4, originX, originY, originX + sizePx, originY + sizePx, zLevel, viewerX, viewerY, cameraHeight, strength);
}
/** @returns {typeof sHorizontalCorners} Reuses module scratch — consume immediately, do not store. */
export function projectHorizontalSurfaceCorners(originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight, viewport = null) {
    return projectHorizontalSurfaceCornersInto(sHorizontalCorners, originX, originY, sizePx, zLevel, viewerX, viewerY, cameraHeight, viewport);
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
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!obstacleGrid?.cols) return false;
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
        if (obstacleGrid.isBlocked(col, row)) found = true;
    });
    return found;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function clipChunkToBlockedCells(ctx, obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!obstacleGrid?.cols) return false;
    const segmentGrid = obstacleGrid.segmentGrid;
    return clipToPath(ctx, (ctx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
            if (!obstacleGrid.isBlocked(col, row)) return;
            const idx = colRowToIndex(col, row, obstacleGrid.cols);
            if (segmentGrid?.[idx]?.length) return;
            traceAabbRect(ctx, obstacleGrid.getCellBounds(col, row));
            clippedAny = true;
        });
        return clippedAny;
    });
}
/**
 * World-aligned alpha mask for static stamp roofs in one chunk (baked once per invalidation).
 *
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {import("../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} staticOccupancyLayers
 * @param {number} texelResolution
 * @returns {OffscreenCanvas | null}
 */
export function buildStaticRoofMaskCanvas(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, staticOccupancyLayers, texelResolution) {
    if (!obstacleGrid?.cols || !staticOccupancyLayers?.length) return null;
    const bakeSize = bakePixelsForWorldSpan(chunkSizePx, { texelResolution });
    const cellBakeSize = bakePixelsForWorldSpan(obstacleGrid.cellSize, { texelResolution });
    const canvas = new OffscreenCanvas(bakeSize, bakeSize);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    let any = false;
    forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
        if (resolveStaticWallHeightAtCell(obstacleGrid, col, row, staticOccupancyLayers) !== zLevel) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const x = Math.round((bounds.minX - chunkOriginX) * texelResolution);
        const y = Math.round((bounds.minY - chunkOriginY) * texelResolution);
        ctx.fillRect(x, y, cellBakeSize, cellBakeSize);
        any = true;
    });
    return any ? canvas : null;
}
/** @param {CanvasImageSource} roofCanvas @param {CanvasImageSource} maskCanvas */
export function applyStaticRoofMaskToCanvas(roofCanvas, maskCanvas) {
    const w = roofCanvas.width;
    const h = roofCanvas.height;
    const out = new OffscreenCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.drawImage(roofCanvas, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    return out;
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
    return clipToPath(ctx, (ctx) => {
        let clippedAny = false;
        for (let i = 0; i < roofs.length; i++) {
            const roof = roofs[i];
            if (roof.simWall?.isDead) continue;
            if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
            roof.draw(ctx, viewport, cameraHeight, viewerX, viewerY);
            clippedAny = true;
        }
        return clippedAny;
    });
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
    return clipToPath(ctx, (ctx) => {
        let clippedAny = false;
        for (let i = 0; i < segments.length; i++) {
            const wall = segments[i];
            if (wall.isDead || wall.collisionOnly) continue;
            traceClosedPolygon(ctx, getSegmentFootprintCorners(wall));
            clippedAny = true;
        }
        return clippedAny;
    });
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
        const damageAlpha = getDamageAlphaFromHealth(roof.simWall.health, roof.simWall.maxHealth);
        if (damageAlpha <= 0) continue;
        drawDamageOverlayInClip(ctx, damageAlpha, (ctx) => {
            roof.draw(ctx, viewport, cameraHeight, viewerX, viewerY);
        });
    }
}
/**
 * Per-cell static roof damage tint at zLevel (same overlay as entity roof caps).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {number} zLevel
 * @param {import("../World/staticOccupancyLayers.js").StaticOccupancyLayer[] | null | undefined} staticOccupancyLayers
 * @param {object} state
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 * @param {import("../Viewport/Viewport.js").Viewport | null | undefined} [viewport]
 */
export function drawStaticRoofDamageOverlays(ctx, obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel, staticOccupancyLayers, state, viewerX, viewerY, cameraHeight, viewport = null) {
    if (!obstacleGrid?.cols || !staticOccupancyLayers?.length || !state) return;
    const cellSize = obstacleGrid.cellSize;
    forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
        if (resolveStaticWallHeightAtCell(obstacleGrid, col, row, staticOccupancyLayers) !== zLevel) return;
        const damageAlpha = getStaticCellDamageAlphaAtGrid(obstacleGrid, state, col, row);
        if (damageAlpha <= 0) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const corners = projectHorizontalSurfaceCornersInto(sHorizontalCorners, bounds.minX, bounds.minY, cellSize, zLevel, viewerX, viewerY, cameraHeight, viewport);
        drawPolygonDamageOverlay(ctx, corners, damageAlpha);
    });
}
/**
 * Per-cell static wall damage tint for flat 2D rail caps.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 * @param {object} state
 */
export function drawStaticWallFootprintDamageOverlays(ctx, obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, state) {
    if (!obstacleGrid?.cols || !state) return;
    forEachObstacleGridCellInAabb(obstacleGrid, { minX: chunkOriginX, minY: chunkOriginY, maxX: chunkOriginX + chunkSizePx, maxY: chunkOriginY + chunkSizePx }, (col, row) => {
        if (!cellIsStaticBlocked(obstacleGrid, col, row)) return;
        const damageAlpha = getStaticCellDamageAlphaAtGrid(obstacleGrid, state, col, row);
        if (damageAlpha <= 0) return;
        drawAabbDamageOverlay(ctx, obstacleGrid.getCellBounds(col, row), damageAlpha);
    });
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
        const damageAlpha = getDamageAlphaFromHealth(wall.health, wall.maxHealth);
        if (damageAlpha <= 0) continue;
        drawPolygonDamageOverlay(ctx, getSegmentFootprintCorners(wall), damageAlpha);
    }
}
