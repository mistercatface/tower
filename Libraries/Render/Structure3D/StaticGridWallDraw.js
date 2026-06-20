/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { collectVoxelWallFacesInAabb } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/iso/IsometricProjection.js";
/** @type {{ grid: object | null, wallGridRevision: number, wallDamageRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, faces: object[] }} */
const sGeomCache = { grid: null, wallGridRevision: -1, wallDamageRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: [] };
/** @param {{ grid: object | null, wallGridRevision: number, wallDamageRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number }} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {number} [wallDamageRevision] */
export function wallGridDrawCacheHit(cache, grid, wallGridRevision, bounds, wallDamageRevision = 0) {
    return (
        cache.grid === grid &&
        cache.wallGridRevision === wallGridRevision &&
        cache.wallDamageRevision === wallDamageRevision &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
/** @param {{ grid: object | null, wallGridRevision: number, wallDamageRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number }} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds @param {number} [wallDamageRevision] */
export function storeWallGridDrawCache(cache, grid, wallGridRevision, bounds, wallDamageRevision = 0) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.wallDamageRevision = wallDamageRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridWallDrawables(obstacleGrid, viewport, viewerX, viewerY, out, wallDamageRevision = 0) {
    out.length = 0;
    const bounds = viewport.bounds("structure");
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sGeomCache, obstacleGrid, wallGridRevision, bounds, wallDamageRevision)) {
        collectVoxelWallFacesInAabb(obstacleGrid, bounds, sGeomCache.faces);
        storeWallGridDrawCache(sGeomCache, obstacleGrid, wallGridRevision, bounds, wallDamageRevision);
    }
    const faces = sGeomCache.faces;
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        if (!isOutwardFaceTowardViewer(face.cx, face.cy, face.outX, face.outY, viewerX, viewerY)) continue;
        const viewX = face.cx - viewerX;
        const viewY = face.cy - viewerY;
        face._distSq = viewX * viewX + viewY * viewY;
        out.push(face);
    }
    return out;
}
export function invalidateStaticGridWallDrawCache() {
    sGeomCache.wallGridRevision = -1;
    sGeomCache.wallDamageRevision = -1;
    sGeomCache.faces.length = 0;
}
