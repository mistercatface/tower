/**
 * Per-chunk horizontal surface draw context — built once per visible chunk in `drawGroundChunks`.
 */
import { projectWorldAabbCornersInto } from "../Spatial/iso/IsometricProjection.js";
import { getSegmentFootprintCorners } from "../Spatial/geometry/WallGeometry.js";
import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { traceAabbRect, traceClosedPolygon, clipToPath } from "../Canvas/CanvasPath.js";
import { getDamageAlphaFromHealth, drawAabbDamageOverlay, drawPolygonDamageOverlay } from "../Render/Structure3D/wallDamageVisual.js";
import { gridWallEdgeRailFootprintAabb, gridWallEdgeRailShouldEmit, resolveCellWallHeightAtIdx } from "../World/wallGridCells.js";
import { getStaticCellDamageAlphaAtIdx, getStaticEdgeDamageAlphaAt } from "../World/staticCellDamage.js";
/**
 * @typedef {Object} ChunkDrawPass
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} originX
 * @property {number} originY
 * @property {number} sizePx
 * @property {number} zLevel
 * @property {import("../Viewport/Viewport.js").Viewport | null} viewport
 * @property {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid | null} obstacleGrid
 * @property {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings | null} settings
 * @property {number} texelResolution — pixels per world unit; read once per `drawGroundChunks` pass
 * @property {object | null} state
 * @property {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null} wallSpatialIndex
 * @property {import("../Math/Aabb2D.js").Aabb2D} chunkAabb
 * @property {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 */
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
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ChunkDrawPass} pass
 * @param {[{ x: number, y: number }, { x: number, y: number }, { x: number, y: number }, { x: number, y: number }]} cornerScratch
 */
export function drawStaticRoofDamageOverlays(ctx, pass, cornerScratch) {
    const { obstacleGrid, state, zLevel } = pass;
    const cellSize = obstacleGrid.cellSize;
    forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) !== zLevel) return;
        const damageAlpha = getStaticCellDamageAlphaAtIdx(obstacleGrid, state, col, row, idx);
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
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
            if (obstacleGrid.grid[idx] === 0) return;
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
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToFlatWallFootprints(ctx, pass) {
    const { obstacleGrid, wallSpatialIndex, zLevel } = pass;
    const segmentGrid = obstacleGrid.segmentGrid;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        if (wallSpatialIndex) {
            const segments = wallSpatialIndex.collectInBounds(pass.chunkAabb);
            for (let i = 0; i < segments.length; i++) {
                const wall = segments[i];
                if (wall.isDead || wall.collisionOnly) continue;
                traceClosedPolygon(clipCtx, getSegmentFootprintCorners(wall));
                clippedAny = true;
            }
        }
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
            if (obstacleGrid.grid[idx] !== 0 && !segmentGrid?.[idx]?.length) {
                traceAabbRect(clipCtx, obstacleGrid.getCellBounds(col, row));
                clippedAny = true;
            }
            for (let side = 0; side < 4; side++) {
                if (!gridWallEdgeRailShouldEmit(obstacleGrid, col, row, side)) continue;
                if (obstacleGrid.edgeGrid[idx * 4 + side] * obstacleGrid.cellSize !== zLevel) continue;
                traceAabbRect(clipCtx, gridWallEdgeRailFootprintAabb(obstacleGrid, col, row, side));
                clippedAny = true;
            }
        });
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass @returns {boolean} */
export function clipChunkToStaticEdgeRails(ctx, pass) {
    const { obstacleGrid, zLevel } = pass;
    return clipToPath(ctx, (clipCtx) => {
        let clippedAny = false;
        forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
            for (let side = 0; side < 4; side++) {
                if (!gridWallEdgeRailShouldEmit(obstacleGrid, col, row, side)) continue;
                if (obstacleGrid.edgeGrid[idx * 4 + side] * obstacleGrid.cellSize !== zLevel) continue;
                traceAabbRect(clipCtx, gridWallEdgeRailFootprintAabb(obstacleGrid, col, row, side));
                clippedAny = true;
            }
        });
        return clippedAny;
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass */
export function drawStaticWallFootprintDamageOverlays(ctx, pass) {
    const { obstacleGrid, state } = pass;
    forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
        const damageAlpha = getStaticCellDamageAlphaAtIdx(obstacleGrid, state, col, row, idx);
        if (damageAlpha <= 0) return;
        drawAabbDamageOverlay(ctx, obstacleGrid.getCellBounds(col, row), damageAlpha);
    });
}
/** @param {CanvasRenderingContext2D} ctx @param {ChunkDrawPass} pass */
export function drawStaticEdgeRailFootprintDamageOverlays(ctx, pass) {
    const { obstacleGrid, state, zLevel } = pass;
    forEachObstacleGridCellInAabb(obstacleGrid, pass.chunkAabb, (col, row, idx) => {
        for (let side = 0; side < 4; side++) {
            if (!gridWallEdgeRailShouldEmit(obstacleGrid, col, row, side)) continue;
            if (obstacleGrid.edgeGrid[idx * 4 + side] * obstacleGrid.cellSize !== zLevel) continue;
            const damageAlpha = getStaticEdgeDamageAlphaAt(obstacleGrid, state, col, row, side);
            if (damageAlpha <= 0) continue;
            drawAabbDamageOverlay(ctx, gridWallEdgeRailFootprintAabb(obstacleGrid, col, row, side), damageAlpha);
        }
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
