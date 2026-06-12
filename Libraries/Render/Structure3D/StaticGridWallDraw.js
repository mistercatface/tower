/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { forEachObstacleGridCellInAabb } from "../../Spatial/grid/GridCoords.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
import { cellIsStaticWall, resolveCellWallHeightPx } from "../../World/wallGridCells.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
/** @type {{ grid: object | null, wallGridRevision: number, defaultWallHeight: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, faces: object[] }} */
const sGeomCache = { grid: null, wallGridRevision: -1, defaultWallHeight: 0, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: [] };
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {number} defaultWallHeight @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function geomCacheHit(cache, grid, wallGridRevision, defaultWallHeight, bounds) {
    return (
        cache.grid === grid &&
        cache.wallGridRevision === wallGridRevision &&
        cache.defaultWallHeight === defaultWallHeight &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
/** @param {typeof sGeomCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {number} defaultWallHeight @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function storeGeomCache(cache, grid, wallGridRevision, defaultWallHeight, bounds) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.defaultWallHeight = defaultWallHeight;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings @returns {number | null} null = open air */
function staticCellCapHeight(grid, col, row, settings) {
    if (!grid.isBlocked(col, row)) return null;
    const px = resolveCellWallHeightPx(grid, col, row, settings);
    return px > 0 ? px : null;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge */
function staticCellNeighbor(grid, col, row, edge) {
    let nc = col;
    let nr = row;
    if (edge === 0) nr = row - 1;
    else if (edge === 1) nc = col + 1;
    else if (edge === 2) nr = row + 1;
    else nc = col - 1;
    return { nc, nr };
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings @param {number} faceHeight */
function staticCellEdgeShouldShowFace(grid, col, row, edge, settings, faceHeight) {
    const { nc, nr } = staticCellNeighbor(grid, col, row, edge);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return true;
    const neighborCap = staticCellCapHeight(grid, nc, nr, settings);
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings @param {number} faceHeight @returns {number} */
function staticCellEdgeWallBaseZ(grid, col, row, edge, settings, faceHeight) {
    const { nc, nr } = staticCellNeighbor(grid, col, row, edge);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return 0;
    const neighborCap = staticCellCapHeight(grid, nc, nr, settings);
    if (neighborCap == null || faceHeight <= neighborCap) return 0;
    return neighborCap;
}
/** @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} edge @param {typeof sP1} p1 @param {typeof sP2} p2 */
function staticCellEdgeEndpoints(grid, col, row, edge, p1, p2) {
    const bounds = grid.getCellBounds(col, row);
    const minX = bounds.minX;
    const minY = bounds.minY;
    const maxX = bounds.maxX;
    const maxY = bounds.maxY;
    if (edge === 0) {
        p1.x = minX;
        p1.y = minY;
        p2.x = maxX;
        p2.y = minY;
    } else if (edge === 1) {
        p1.x = maxX;
        p1.y = minY;
        p2.x = maxX;
        p2.y = maxY;
    } else if (edge === 2) {
        p1.x = maxX;
        p1.y = maxY;
        p2.x = minX;
        p2.y = maxY;
    } else {
        p1.x = minX;
        p1.y = maxY;
        p2.x = minX;
        p2.y = minY;
    }
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Math/Aabb2D.js").Aabb2D} bounds
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @param {object[]} out
 */
function collectStaticGridWallFaceCandidates(obstacleGrid, bounds, settings, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row) => {
        if (!cellIsStaticWall(obstacleGrid, col, row)) return;
        const faceHeight = resolveCellWallHeightPx(obstacleGrid, col, row, settings);
        if (faceHeight <= 0) return;
        const cellBounds = obstacleGrid.getCellBounds(col, row);
        const cx = (cellBounds.minX + cellBounds.maxX) / 2;
        const cy = (cellBounds.minY + cellBounds.maxY) / 2;
        for (let edge = 0; edge < 4; edge++) {
            if (!staticCellEdgeShouldShowFace(obstacleGrid, col, row, edge, settings, faceHeight)) continue;
            staticCellEdgeEndpoints(obstacleGrid, col, row, edge, sP1, sP2);
            const ecx = (sP1.x + sP2.x) / 2;
            const ecy = (sP1.y + sP2.y) / 2;
            const wallBaseZ = staticCellEdgeWallBaseZ(obstacleGrid, col, row, edge, settings, faceHeight);
            out.push({
                staticGrid: true,
                gridCol: col,
                gridRow: row,
                p1: { x: sP1.x, y: sP1.y },
                p2: { x: sP2.x, y: sP2.y },
                wallBaseZ,
                wallHeight: faceHeight - wallBaseZ,
                wallCapHeight: faceHeight,
                cx: ecx,
                cy: ecy,
                outX: ecx - cx,
                outY: ecy - cy,
            });
        }
    });
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridWallDrawables(obstacleGrid, viewport, settings, viewerX, viewerY, out) {
    out.length = 0;
    if (!obstacleGrid?.cols) return out;
    const bounds = viewport.boundsQuery;
    const defaultWallHeight = getWallHeight(settings);
    const wallGridRevision = obstacleGrid.wallGridRevision ?? 0;
    if (!geomCacheHit(sGeomCache, obstacleGrid, wallGridRevision, defaultWallHeight, bounds)) {
        collectStaticGridWallFaceCandidates(obstacleGrid, bounds, settings, sGeomCache.faces);
        storeGeomCache(sGeomCache, obstacleGrid, wallGridRevision, defaultWallHeight, bounds);
    }
    const faces = sGeomCache.faces;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const viewX = face.cx - viewerX;
        const viewY = face.cy - viewerY;
        if (face.outX * viewX + face.outY * viewY >= 0) continue;
        face._distSq = viewX * viewX + viewY * viewY;
        out.push(face);
    }
    return out;
}
