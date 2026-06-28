/**
 * Edge rail draw — thin axis-aligned box via projectWorldPointInto.
 */
import { collectRailWallBoxesInAabb, RailWallBoxList } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/elevation/RadialElevationProjection.js";
import { drawProjectedWallFace, drawProjectedRailWallCap } from "./ProjectedWallDraw.js";
import { storeWallGridDrawCache, wallGridDrawCacheHit } from "./StaticGridWallDraw.js";
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: new RailWallBoxList() };
const sRailP1 = { x: 0, y: 0 };
const sRailP2 = { x: 0, y: 0 };
function bindRailEdge(p1, p2, x1, y1, x2, y2) {
    p1.x = x1;
    p1.y = y1;
    p2.x = x2;
    p2.y = y2;
}
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
export function collectStaticGridEdgeRailDrawables(obstacleGrid, viewport, out) {
    out.length = 0;
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds)) {
        collectRailWallBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeWallGridDrawCache(sBoxCache, obstacleGrid, wallGridRevision, bounds);
    }
    const boxes = sBoxCache.boxes;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes.viewAt(i);
        if (!railWallBoxTowardViewer(box, viewerX, viewerY)) continue;
        const viewX = box.cx - viewerX;
        const viewY = box.cy - viewerY;
        box._distSq = viewX * viewX + viewY * viewY;
        out.push(box);
    }
    return out;
}
export function drawProjectedGridEdgeRail(ctx, box, viewport, state, face, skipWallCaps = false) {
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    bindRailEdge(sRailP1, sRailP2, box.innerP1x, box.innerP1y, box.innerP2x, box.innerP2y);
    if (isOutwardFaceTowardViewer((box.innerP1x + box.innerP2x) * 0.5, (box.innerP1y + box.innerP2y) * 0.5, box.inwardX, box.inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "inner";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
    }
    bindRailEdge(sRailP1, sRailP2, box.outerP1x, box.outerP1y, box.outerP2x, box.outerP2y);
    if (isOutwardFaceTowardViewer((box.outerP1x + box.outerP2x) * 0.5, (box.outerP1y + box.outerP2y) * 0.5, -box.inwardX, -box.inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "outer";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
    }
    const dx = box.innerP2x - box.innerP1x;
    const dy = box.innerP2y - box.innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        bindRailEdge(sRailP1, sRailP2, box.outerP1x, box.outerP1y, box.innerP1x, box.innerP1y);
        if (isOutwardFaceTowardViewer((box.outerP1x + box.innerP1x) * 0.5, (box.outerP1y + box.innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            face.atlasFaceId = "end0";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
        }
        bindRailEdge(sRailP1, sRailP2, box.innerP2x, box.innerP2y, box.outerP2x, box.outerP2y);
        if (isOutwardFaceTowardViewer((box.innerP2x + box.outerP2x) * 0.5, (box.innerP2y + box.outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            face.atlasFaceId = "end1";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
        }
    }
    face.atlasFaceId = undefined;
    if (!skipWallCaps) drawProjectedRailWallCap(ctx, box, viewport, state, face);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.clear();
}
