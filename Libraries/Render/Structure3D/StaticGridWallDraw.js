/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { collectVoxelWallFacesInAabb } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/elevation/RadialElevationProjection.js";
const sGeomCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: [] };
export function wallGridDrawCacheHit(cache, grid, wallGridRevision, bounds) {
    return (
        cache.grid === grid &&
        cache.wallGridRevision === wallGridRevision &&
        cache.gridCols === grid.cols &&
        cache.gridRows === grid.rows &&
        cache.boundsMinX === bounds.minX &&
        cache.boundsMaxX === bounds.maxX &&
        cache.boundsMinY === bounds.minY &&
        cache.boundsMaxY === bounds.maxY
    );
}
export function storeWallGridDrawCache(cache, grid, wallGridRevision, bounds) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
export function collectStaticGridWallDrawables(obstacleGrid, viewport, out) {
    out.length = 0;
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sGeomCache, obstacleGrid, wallGridRevision, bounds)) {
        collectVoxelWallFacesInAabb(obstacleGrid, bounds, sGeomCache.faces);
        storeWallGridDrawCache(sGeomCache, obstacleGrid, wallGridRevision, bounds);
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
    sGeomCache.faces.length = 0;
}
