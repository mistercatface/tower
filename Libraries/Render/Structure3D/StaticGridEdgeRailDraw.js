import { collectRailWallBoxesInAabb, RailWallBoxList, RAIL_BOX, RAIL_BOX_STRIDE } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/elevation/RadialElevationProjection.js";
import { drawProjectedWallFaceScalars, drawProjectedRailWallCapFlat } from "./ProjectedWallDraw.js";
import { storeWallGridDrawCache, wallGridDrawCacheHit } from "./StaticGridWallDraw.js";
import { borrowTicket } from "../Structure3D/visibleTickets.js";
const sBoxCache = { grid: null, wallGridRevision: -1, boundsMinX: 0, boundsMaxX: 0, boundsMinY: 0, boundsMaxY: 0, gridCols: 0, gridRows: 0, boxes: new RailWallBoxList() };
function railWallBoxTowardViewerFlat(data, base, viewerX, viewerY) {
    const minX = data[base + RAIL_BOX.minX];
    const maxX = data[base + RAIL_BOX.maxX];
    const minY = data[base + RAIL_BOX.minY];
    const maxY = data[base + RAIL_BOX.maxY];
    if (viewerX >= minX && viewerX <= maxX && viewerY >= minY && viewerY <= maxY) return true;
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    const innerMidX = (innerP1x + innerP2x) * 0.5;
    const innerMidY = (innerP1y + innerP2y) * 0.5;
    const outerMidX = (outerP1x + outerP2x) * 0.5;
    const outerMidY = (outerP1y + outerP2y) * 0.5;
    if (isOutwardFaceTowardViewer(innerMidX, innerMidY, inwardX, inwardY, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer(outerMidX, outerMidY, -inwardX, -inwardY, viewerX, viewerY)) return true;
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return false;
    const tx = dx / len;
    const ty = dy / len;
    if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) return true;
    if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) return true;
    return false;
}
export function collectStaticGridEdgeRailDrawables(obstacleGrid, viewport, out) {
    const bounds = viewport.bounds("structure");
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const wallGridRevision = obstacleGrid.wallGridRevision;
    if (!wallGridDrawCacheHit(sBoxCache, obstacleGrid, wallGridRevision, bounds)) {
        collectRailWallBoxesInAabb(obstacleGrid, bounds, sBoxCache.boxes);
        storeWallGridDrawCache(sBoxCache, obstacleGrid, wallGridRevision, bounds);
    }
    const boxes = sBoxCache.boxes;
    const data = boxes.data;
    const numBoxes = boxes.length;
    for (let i = 0; i < numBoxes; i++) {
        const base = i * RAIL_BOX_STRIDE;
        if (!railWallBoxTowardViewerFlat(data, base, viewerX, viewerY)) continue;
        const cx = data[base + RAIL_BOX.cx];
        const cy = data[base + RAIL_BOX.cy];
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        out.push(borrowTicket("rail", base, null, distSq));
    }
    return out;
}
export function getRailWallBoxData() {
    return sBoxCache.boxes.data;
}
export function drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, face, skipWallCaps = false) {
    const data = sBoxCache.boxes.data;
    const base = baseIndex;
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    if (isOutwardFaceTowardViewer((innerP1x + innerP2x) * 0.5, (innerP1y + innerP2y) * 0.5, inwardX, inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "inner";
        drawProjectedWallFaceScalars(ctx, innerP1x, innerP1y, innerP2x, innerP2y, viewport, state, face);
    }
    if (isOutwardFaceTowardViewer((outerP1x + outerP2x) * 0.5, (outerP1y + outerP2y) * 0.5, -inwardX, -inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "outer";
        drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, outerP2x, outerP2y, viewport, state, face);
    }
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            face.atlasFaceId = "end0";
            drawProjectedWallFaceScalars(ctx, outerP1x, outerP1y, innerP1x, innerP1y, viewport, state, face);
        }
        if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            face.atlasFaceId = "end1";
            drawProjectedWallFaceScalars(ctx, innerP2x, innerP2y, outerP2x, outerP2y, viewport, state, face);
        }
    }
    face.atlasFaceId = undefined;
    if (!skipWallCaps) drawProjectedRailWallCapFlat(ctx, data, base, viewport, state, face);
}
export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.clear();
}
