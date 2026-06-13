/**
 * Edge rail draw — thin axis-aligned box via projectWorldPointInto (not computeProjectedFace).
 */
import { collectGridEdgeRailBoxesInAabb } from "../../World/wallGridCells.js";
import { projectWorldAabbCornersInto } from "../../Spatial/iso/IsometricProjection.js";
import { traceClosedPolygon } from "../../Canvas/CanvasPath.js";
import { drawProjectedWallFaceElevated } from "./ProjectedWallDraw.js";
/** @type {{ grid: object | null, wallGridRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, boxes: object[] }} */
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: [] };
const sTopCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/** @param {typeof sBoxCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function boxCacheHit(cache, grid, wallGridRevision, bounds) {
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
/** @param {typeof sBoxCache} cache @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} wallGridRevision @param {import("../../Math/Aabb2D.js").Aabb2D} bounds */
function storeBoxCache(cache, grid, wallGridRevision, bounds) {
    cache.grid = grid;
    cache.wallGridRevision = wallGridRevision;
    cache.gridCols = grid.cols;
    cache.gridRows = grid.rows;
    cache.boundsMinX = bounds.minX;
    cache.boundsMaxX = bounds.maxX;
    cache.boundsMinY = bounds.minY;
    cache.boundsMaxY = bounds.maxY;
}
/** @param {{ x: number, y: number }} p1 @param {{ x: number, y: number }} p2 @param {number} outX @param {number} outY @param {number} viewerX @param {number} viewerY */
function sideFaceVisible(p1, p2, outX, outY, viewerX, viewerY) {
    const midX = (p1.x + p2.x) * 0.5;
    const midY = (p1.y + p2.y) * 0.5;
    const viewX = midX - viewerX;
    const viewY = midY - viewerY;
    return outX * viewX + outY * viewY < 0;
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridEdgeRailDrawables(obstacleGrid, viewport, viewerX, viewerY, out) {
    out.length = 0;
    const bounds = viewport.boundsQuery;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!boxCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds)) {
        collectGridEdgeRailBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeBoxCache(sBoxCache, obstacleGrid, wallGridRevision, bounds);
    }
    const boxes = sBoxCache.boxes;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const viewX = box.cx - viewerX;
        const viewY = box.cy - viewerY;
        box._distSq = viewX * viewX + viewY * viewY;
        out.push(box);
    }
    return out;
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} box
 * @param {import("./WallDrawContext.js").WallDrawContext} wallCtx
 */
export function drawProjectedGridEdgeRail(ctx, box, wallCtx) {
    const camera = wallCtx.camera;
    const viewerX = camera.viewerX;
    const viewerY = camera.viewerY;
    wallCtx.wallHeight = box.wallHeight;
    wallCtx.wallBaseZ = box.wallBaseZ;
    wallCtx.wallCapHeight = box.wallCapHeight;
    wallCtx.cacheObj = box;
    if (sideFaceVisible(box.innerP1, box.innerP2, box.inwardX, box.inwardY, viewerX, viewerY)) drawProjectedWallFaceElevated(ctx, box.innerP1, box.innerP2, wallCtx);
    if (sideFaceVisible(box.outerP1, box.outerP2, -box.inwardX, -box.inwardY, viewerX, viewerY)) drawProjectedWallFaceElevated(ctx, box.outerP1, box.outerP2, wallCtx);
    // Draw end faces of the thin wall box (connecting inner and outer corners)
    const dx = box.innerP2.x - box.innerP1.x;
    const dy = box.innerP2.y - box.innerP1.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        const oldCacheObj = wallCtx.cacheObj;
        // End face at P1 (outerP1 -> innerP1) has outward normal (-tx, -ty)
        if (sideFaceVisible(box.outerP1, box.innerP1, -tx, -ty, viewerX, viewerY)) {
            // Null cacheObj prevents using long side atlas cache, forcing correct end face texture generation
            wallCtx.cacheObj = null;
            drawProjectedWallFaceElevated(ctx, box.outerP1, box.innerP1, wallCtx);
        }
        // End face at P2 (innerP2 -> outerP2) has outward normal (tx, ty)
        if (sideFaceVisible(box.innerP2, box.outerP2, tx, ty, viewerX, viewerY)) {
            wallCtx.cacheObj = null;
            drawProjectedWallFaceElevated(ctx, box.innerP2, box.outerP2, wallCtx);
        }
        wallCtx.cacheObj = oldCacheObj;
    }
    const capZ = box.wallBaseZ + box.wallHeight;
    projectWorldAabbCornersInto(sTopCorners, box.minX, box.minY, box.maxX, box.maxY, capZ, camera);
    ctx.beginPath();
    traceClosedPolygon(ctx, sTopCorners);
    ctx.fillStyle = wallCtx.fillStyle;
    ctx.fill();
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.length = 0;
}
