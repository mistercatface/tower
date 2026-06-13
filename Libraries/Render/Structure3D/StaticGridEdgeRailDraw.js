/**
 * Edge rail draw — thin axis-aligned box via projectWorldPointInto.
 */
import { collectGridEdgeRailBoxesInAabb } from "../../World/wallGridCells.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/iso/IsometricProjection.js";
import { drawProjectedWallFace, drawProjectedRailWallCap } from "./ProjectedWallDraw.js";
import { storeWallGridDrawCache, wallGridDrawCacheHit } from "./StaticGridWallDraw.js";
/** @type {{ grid: object | null, wallGridRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, boxes: object[] }} */
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: [] };
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
    if (!wallGridDrawCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds)) {
        collectGridEdgeRailBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeWallGridDrawCache(sBoxCache, obstacleGrid, wallGridRevision, bounds);
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
    if (isOutwardFaceTowardViewer((box.innerP1.x + box.innerP2.x) * 0.5, (box.innerP1.y + box.innerP2.y) * 0.5, box.inwardX, box.inwardY, viewerX, viewerY))
        drawProjectedWallFace(ctx, box.innerP1, box.innerP2, wallCtx);
    if (isOutwardFaceTowardViewer((box.outerP1.x + box.outerP2.x) * 0.5, (box.outerP1.y + box.outerP2.y) * 0.5, -box.inwardX, -box.inwardY, viewerX, viewerY))
        drawProjectedWallFace(ctx, box.outerP1, box.outerP2, wallCtx);
    const dx = box.innerP2.x - box.innerP1.x;
    const dy = box.innerP2.y - box.innerP1.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        const oldCacheObj = wallCtx.cacheObj;
        if (isOutwardFaceTowardViewer((box.outerP1.x + box.innerP1.x) * 0.5, (box.outerP1.y + box.innerP1.y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            wallCtx.cacheObj = null;
            drawProjectedWallFace(ctx, box.outerP1, box.innerP1, wallCtx);
        }
        if (isOutwardFaceTowardViewer((box.innerP2.x + box.outerP2.x) * 0.5, (box.innerP2.y + box.outerP2.y) * 0.5, tx, ty, viewerX, viewerY)) {
            wallCtx.cacheObj = null;
            drawProjectedWallFace(ctx, box.innerP2, box.outerP2, wallCtx);
        }
        wallCtx.cacheObj = oldCacheObj;
    }
    drawProjectedRailWallCap(ctx, box, wallCtx);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.length = 0;
}
