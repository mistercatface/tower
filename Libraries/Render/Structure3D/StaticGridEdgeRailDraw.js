/**
 * Edge rail draw — thin axis-aligned box via projectWorldPointInto.
 */
import { collectRailWallBoxesInAabb } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/iso/IsometricProjection.js";
import { drawProjectedWallFace, drawProjectedRailWallCap } from "./ProjectedWallDraw.js";
import { storeWallGridDrawCache, wallGridDrawCacheHit } from "./StaticGridWallDraw.js";
/** @type {{ grid: object | null, wallGridRevision: number, wallDamageRevision: number, boundsMinX: number, boundsMaxX: number, boundsMinY: number, boundsMaxY: number, gridCols: number, gridRows: number, boxes: object[] }} */
const sBoxCache = { grid: null, wallGridRevision: -1, wallDamageRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: [] };
const sRailP1 = { x: 0, y: 0 };
const sRailP2 = { x: 0, y: 0 };
/** @param {{ x: number, y: number }} p1 @param {{ x: number, y: number }} p2 @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
function bindRailEdge(p1, p2, x1, y1, x2, y2) {
    p1.x = x1;
    p1.y = y1;
    p2.x = x2;
    p2.y = y2;
}
/** @param {object} box @param {number} viewerX @param {number} viewerY */
function railWallBoxTowardViewer(box, viewerX, viewerY) {
    if (viewerX >= box.minX && viewerX <= box.maxX && viewerY >= box.minY && viewerY <= box.maxY) return true;
    const innerMidX = (box.innerP1x + box.innerP2x) * 0.5;
    const innerMidY = (box.innerP1y + box.innerP2y) * 0.5;
    const outerMidX = (box.outerP1x + box.outerP2x) * 0.5;
    const outerMidY = (box.outerP1y + box.outerP2y) * 0.5;
    if (isOutwardFaceTowardViewer(innerMidX, innerMidY, box.inwardX, box.inwardY, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer(outerMidX, outerMidY, -box.inwardX, -box.inwardY, viewerX, viewerY)) return true;
    const dx = box.innerP2x - box.innerP1x;
    const dy = box.innerP2y - box.innerP1y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return false;
    const tx = dx / len;
    const ty = dy / len;
    if (isOutwardFaceTowardViewer((box.outerP1x + box.innerP1x) * 0.5, (box.outerP1y + box.innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer((box.innerP2x + box.outerP2x) * 0.5, (box.innerP2y + box.outerP2y) * 0.5, tx, ty, viewerX, viewerY)) return true;
    return false;
}
/**
 * @param {import("../../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} obstacleGrid
 * @param {import("../../Viewport/Viewport.js").Viewport} viewport
 * @param {number} viewerX
 * @param {number} viewerY
 * @param {object[]} out
 */
export function collectStaticGridEdgeRailDrawables(obstacleGrid, viewport, viewerX, viewerY, out, wallDamageRevision = 0) {
    out.length = 0;
    const bounds = viewport.bounds("structure");
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds, wallDamageRevision)) {
        collectRailWallBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeWallGridDrawCache(sBoxCache, obstacleGrid, wallGridRevision, bounds, wallDamageRevision);
    }
    const boxes = sBoxCache.boxes;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (!railWallBoxTowardViewer(box, viewerX, viewerY)) continue;
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
    const viewport = wallCtx.viewport;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    bindRailEdge(sRailP1, sRailP2, box.innerP1x, box.innerP1y, box.innerP2x, box.innerP2y);
    if (isOutwardFaceTowardViewer((box.innerP1x + box.innerP2x) * 0.5, (box.innerP1y + box.innerP2y) * 0.5, box.inwardX, box.inwardY, viewerX, viewerY)) {
        wallCtx.atlasFaceId = "inner";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, wallCtx);
    }
    bindRailEdge(sRailP1, sRailP2, box.outerP1x, box.outerP1y, box.outerP2x, box.outerP2y);
    if (isOutwardFaceTowardViewer((box.outerP1x + box.outerP2x) * 0.5, (box.outerP1y + box.outerP2y) * 0.5, -box.inwardX, -box.inwardY, viewerX, viewerY)) {
        wallCtx.atlasFaceId = "outer";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, wallCtx);
    }
    const dx = box.innerP2x - box.innerP1x;
    const dy = box.innerP2y - box.innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        bindRailEdge(sRailP1, sRailP2, box.outerP1x, box.outerP1y, box.innerP1x, box.innerP1y);
        if (isOutwardFaceTowardViewer((box.outerP1x + box.innerP1x) * 0.5, (box.outerP1y + box.innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            wallCtx.atlasFaceId = "end0";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, wallCtx);
        }
        bindRailEdge(sRailP1, sRailP2, box.innerP2x, box.innerP2y, box.outerP2x, box.outerP2y);
        if (isOutwardFaceTowardViewer((box.innerP2x + box.outerP2x) * 0.5, (box.innerP2y + box.outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            wallCtx.atlasFaceId = "end1";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, wallCtx);
        }
    }
    wallCtx.atlasFaceId = undefined;
    if (!wallCtx.skipWallCaps) drawProjectedRailWallCap(ctx, box, wallCtx);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.wallDamageRevision = -1;
    sBoxCache.boxes.length = 0;
}
