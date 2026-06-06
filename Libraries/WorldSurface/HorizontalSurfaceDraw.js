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
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
function horizontalChunkIntersectsBounds(bounds, chunkOriginX, chunkOriginY, chunkSizePx) {
    return !(
        chunkOriginX + chunkSizePx < bounds.minX
        || chunkOriginX > bounds.maxX
        || chunkOriginY + chunkSizePx < bounds.minY
        || chunkOriginY > bounds.maxY
    );
}

/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
function blockedCellsInChunk(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    const cellSize = obstacleGrid.cellSize;
    const minCol = Math.max(0, Math.floor((chunkOriginX - obstacleGrid.minX) / cellSize));
    const minRow = Math.max(0, Math.floor((chunkOriginY - obstacleGrid.minY) / cellSize));
    const maxCol = Math.min(obstacleGrid.cols - 1, Math.ceil((chunkOriginX + chunkSizePx - obstacleGrid.minX) / cellSize) - 1);
    const maxRow = Math.min(obstacleGrid.rows - 1, Math.ceil((chunkOriginY + chunkSizePx - obstacleGrid.minY) / cellSize) - 1);
    return { minCol, minRow, maxCol, maxRow };
}

/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (!obstacleGrid?.cols) return false;

    const { minCol, minRow, maxCol, maxRow } = blockedCellsInChunk(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx);
    for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
            if (!obstacleGrid.isBlocked(col, row)) continue;
            const bounds = obstacleGrid.getCellBounds(col, row);
            if (horizontalChunkIntersectsBounds(bounds, chunkOriginX, chunkOriginY, chunkSizePx)) {
                return true;
            }
        }
    }
    return false;
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
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../Spatial/indexes/WallSpatialIndex.js").WallSpatialIndex | null | undefined} wallSpatialIndex
 * @param {number} chunkOriginX
 * @param {number} chunkOriginY
 * @param {number} chunkSizePx
 */
export function chunkHasRoofContent(obstacleGrid, wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx) {
    if (chunkHasBlockedCells(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx)) {
        return true;
    }
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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} minX
 * @param {number} minY
 * @param {number} sizePx
 * @param {number} zLevel
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {number} cameraHeight
 */
function clipProjectedRect(ctx, minX, minY, sizePx, zLevel, viewerX, viewerY, cameraHeight) {
    clipProjectedQuad(
        ctx,
        [
            { x: minX, y: minY },
            { x: minX + sizePx, y: minY },
            { x: minX + sizePx, y: minY + sizePx },
            { x: minX, y: minY + sizePx },
        ],
        zLevel,
        viewerX,
        viewerY,
        cameraHeight,
    );
}

/**
 * Clip draw to wall footprints at roof elevation (must match projected quad draw).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
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
    obstacleGrid,
    wallSpatialIndex,
    chunkOriginX,
    chunkOriginY,
    chunkSizePx,
    zLevel,
    viewerX,
    viewerY,
    cameraHeight,
) {
    ctx.beginPath();
    let any = false;

    const segments = collectWallSegmentsInChunk(wallSpatialIndex, chunkOriginX, chunkOriginY, chunkSizePx);
    if (segments.length > 0) {
        for (const segment of segments) {
            clipProjectedQuad(ctx, getSegmentFootprintCorners(segment), zLevel, viewerX, viewerY, cameraHeight);
            any = true;
        }
    } else if (obstacleGrid?.cols) {
        const { minCol, minRow, maxCol, maxRow } = blockedCellsInChunk(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx);
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (!obstacleGrid.isBlocked(col, row)) continue;
                const bounds = obstacleGrid.getCellBounds(col, row);
                if (!horizontalChunkIntersectsBounds(bounds, chunkOriginX, chunkOriginY, chunkSizePx)) continue;
                const sizePx = bounds.maxX - bounds.minX;
                clipProjectedRect(ctx, bounds.minX, bounds.minY, sizePx, zLevel, viewerX, viewerY, cameraHeight);
                any = true;
            }
        }
    }

    if (any) ctx.clip();
    return any;
}
