/**
 * Per-chunk horizontal surface draw context — built once per visible chunk in `drawGroundChunks`.
 */
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, traceClosedPolygon, clipToPath } from "../Canvas/CanvasPath.js";
import { worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
import { getDamageAlphaFromHealth, drawAabbDamageOverlay, drawDamageOverlayInClip, drawPolygonDamageOverlay } from "../Render/Structure3D/wallDamageVisual.js";
import { resolveCellWallHeightPx, cellIsStaticWall } from "../World/wallGridCells.js";
import { getStaticCellDamageAlphaAtGrid } from "../World/staticCellDamage.js";
/**
 * @typedef {Object} ChunkDrawPass
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} originX
 * @property {number} originY
 * @property {number} sizePx
 * @property {number} zLevel
 * @property {number} viewerX
 * @property {number} viewerY
 * @property {number} cameraHeight
 * @property {import("../Viewport/Viewport.js").Viewport | null} viewport
 * @property {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null} obstacleGrid
 * @property {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} settings
 * @property {object | null} state
 * @property {import("../Render/Scene/RenderScene.js").RenderScene | null} renderScene
 * @property {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null} wallSpatialIndex
 * @property {import("../Math/Aabb2D.js").Aabb2D} chunkAabb
 * @property {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @property {import("../Render/Scene/Renderables.js").RenderableRoofCap[] | null} [chunkRoofs]
 */
/** @param {ChunkDrawPass} pass */
function getChunkRoofs(pass) {
    if (pass.chunkRoofs) return pass.chunkRoofs;
    const { renderScene, originX, originY, sizePx } = pass;
    if (!renderScene) return (pass.chunkRoofs = []);
    const minCol = worldToChunkCol(originX, renderScene.gridMinX, renderScene.chunkSizePx);
    const maxCol = worldToChunkCol(originX + sizePx - 1, renderScene.gridMinX, renderScene.chunkSizePx);
    const minRow = worldToChunkRow(originY, renderScene.gridMinY, renderScene.chunkSizePx);
    const maxRow = worldToChunkRow(originY + sizePx - 1, renderScene.gridMinY, renderScene.chunkSizePx);
    pass.chunkRoofs = renderScene.collectPass("roofs", minCol, minRow, maxCol, maxRow);
    return pass.chunkRoofs;
}
/** @param {ChunkDrawPass} pass @param {{ originX?: number, originY?: number, sizePx?: number, zLevel?: number } | null} [rect] */
function chunkRect(pass, rect = null) {
    return { originX: rect?.originX ?? pass.originX, originY: rect?.originY ?? pass.originY, sizePx: rect?.sizePx ?? pass.sizePx, zLevel: rect?.zLevel ?? pass.zLevel };
}
/**
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} out4
 * @param {ChunkDrawPass} pass
 * @param {{ originX?: number, originY?: number, sizePx?: number, zLevel?: number } | null} [rect]
 */
export function projectHorizontalSurfaceCornersInto(out4, pass, rect = null) {
    const { originX, originY, sizePx, zLevel } = chunkRect(pass, rect);
    return projectWorldAabbCornersInto(out4, originX, originY, originX + sizePx, originY + sizePx, zLevel, pass.camera);
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToRoofFootprints(ctx, pass) {
    const { zLevel, cameraHeight, viewport } = pass;
    const roofs = getChunkRoofs(pass);
    if (!roofs.length) return false;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        for (let i = 0; i < roofs.length; i++) {
            const roof = roofs[i];
            if (roof.simWall?.isDead) continue;
            if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
            roof.draw(clipCtx, viewport, cameraHeight);
            clippedAny = true;
        }
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass */
export function drawRoofSegmentDamageOverlays(ctx, pass) {
    const { zLevel, cameraHeight, viewport } = pass;
    const roofs = getChunkRoofs(pass);
    for (let i = 0; i < roofs.length; i++) {
        const roof = roofs[i];
        if (roof.simWall?.isDead) continue;
        if (Math.abs(roof.zLevel - zLevel) > 0.01) continue;
        const damageAlpha = getDamageAlphaFromHealth(roof.simWall.health, roof.simWall.maxHealth);
        if (damageAlpha <= 0) continue;
        drawDamageOverlayInClip(ctx, damageAlpha, (clipCtx) => {
            roof.draw(clipCtx, viewport, cameraHeight);
        });
    }
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ChunkDrawPass} pass
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} cornerScratch
 */
export function drawStaticRoofDamageOverlays(ctx, pass, cornerScratch) {
    const { obstacleGrid, state, zLevel } = pass;
    const cellSize = obstacleGrid.cellSize;
    forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row) => {
        if (resolveCellWallHeightPx(obstacleGrid, col, row) !== zLevel) return;
        const damageAlpha = getStaticCellDamageAlphaAtGrid(obstacleGrid, state, col, row);
        if (damageAlpha <= 0) return;
        const bounds = obstacleGrid.getCellBounds(col, row);
        const corners = projectHorizontalSurfaceCornersInto(cornerScratch, pass, { originX: bounds.minX, originY: bounds.minY, sizePx: cellSize });
        drawPolygonDamageOverlay(ctx, corners, damageAlpha);
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToBlockedCells(ctx, pass) {
    const { obstacleGrid } = pass;
    const segmentGrid = obstacleGrid.segmentGrid;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row) => {
            if (!obstacleGrid.isBlocked(col, row)) return;
            const idx = colRowToIndex(col, row, obstacleGrid.cols);
            if (segmentGrid?.[idx]?.length) return;
            traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
            clippedAny = true;
        });
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToWallFootprints(ctx, pass) {
    const { wallSpatialIndex } = pass;
    if (!wallSpatialIndex) return false;
    const segments = wallSpatialIndex.collectInBounds(pass.chunkAabb);
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        for (let i = 0; i < segments.length; i++) {
            const wall = segments[i];
            if (wall.isDead || wall.collisionOnly) continue;
            traceClosedPolygon(clipCtx, getSegmentFootprintCorners(wall));
            clippedAny = true;
        }
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass */
export function drawStaticWallFootprintDamageOverlays(ctx, pass) {
    const { obstacleGrid, state } = pass;
    forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row) => {
        if (!cellIsStaticWall(obstacleGrid, col, row)) return;
        const damageAlpha = getStaticCellDamageAlphaAtGrid(obstacleGrid, state, col, row);
        if (damageAlpha <= 0) return;
        drawAabbDamageOverlay(ctx, obstacleGrid.getCellBounds(col, row), damageAlpha);
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass */
export function drawWallFootprintDamageOverlays(ctx, pass) {
    const { wallSpatialIndex } = pass;
    if (!wallSpatialIndex) return;
    const segments = wallSpatialIndex.collectInBounds(pass.chunkAabb);
    for (let i = 0; i < segments.length; i++) {
        const wall = segments[i];
        if (wall.isDead || wall.collisionOnly) continue;
        const damageAlpha = getDamageAlphaFromHealth(wall.health, wall.maxHealth);
        if (damageAlpha <= 0) continue;
        drawPolygonDamageOverlay(ctx, getSegmentFootprintCorners(wall), damageAlpha);
    }
}
