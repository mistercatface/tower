/**
 * Viewport-scoped draw + query for static obstacle-grid walls (no Segment entities).
 */
import { collectVoxelWallFacesInAabbFlat, VOXEL_FACE, VOXEL_FACE_STRIDE } from "../../World/wallGridBake.js";
import { StrideFloatList } from "../../World/StrideFloatList.js";
import {  isOutwardFaceTowardViewer  } from "../../Spatial/spatial.js";
import { drawProjectedWallFaceScalars } from "./ProjectedWallDraw.js";
import { DRAW_KIND_VOXEL } from "./VisibleDrawQueue.js";
const sGeomCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, faces: new StrideFloatList(VOXEL_FACE_STRIDE) };
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
export function collectStaticGridWallDrawables(obstacleGrid, viewport, outQueue) {
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sGeomCache, obstacleGrid, wallGridRevision, bounds)) {
        collectVoxelWallFacesInAabbFlat(obstacleGrid, bounds, sGeomCache.faces);
        storeWallGridDrawCache(sGeomCache, obstacleGrid, wallGridRevision, bounds);
    }
    const faces = sGeomCache.faces;
    const data = faces.data;
    const numFaces = faces.length;
    for (let i = 0; i < numFaces; i++) {
        const base = i * VOXEL_FACE_STRIDE;
        const cx = data[base + VOXEL_FACE.cx];
        const cy = data[base + VOXEL_FACE.cy];
        const outX = data[base + VOXEL_FACE.outX];
        const outY = data[base + VOXEL_FACE.outY];
        if (!isOutwardFaceTowardViewer(cx, cy, outX, outY, viewerX, viewerY)) continue;
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        outQueue.push(DRAW_KIND_VOXEL, base, null, distSq);
    }
}
export function getVoxelWallFaceData() {
    return sGeomCache.faces.data;
}
export function drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state, face) {
    const data = sGeomCache.faces.data;
    const x1 = data[baseIndex + VOXEL_FACE.x1];
    const y1 = data[baseIndex + VOXEL_FACE.y1];
    const x2 = data[baseIndex + VOXEL_FACE.x2];
    const y2 = data[baseIndex + VOXEL_FACE.y2];
    drawProjectedWallFaceScalars(ctx, x1, y1, x2, y2, viewport, state, face);
}
export function invalidateStaticGridWallDrawCache() {
    sGeomCache.wallGridRevision = -1;
    sGeomCache.faces.clear();
}
