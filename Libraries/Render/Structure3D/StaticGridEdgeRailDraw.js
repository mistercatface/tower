/**
 * Edge rail draw — thin axis-aligned box via projectWorldPointInto.
 */
import { collectRailWallBoxesInAabb, RailWallBoxList, RAIL_BOX, RAIL_BOX_STRIDE } from "../../World/wallGridBake.js";
import { isOutwardFaceTowardViewer } from "../../Spatial/elevation/RadialElevationProjection.js";
import { drawProjectedWallFace, drawProjectedRailWallCapFlat } from "./ProjectedWallDraw.js";
import { storeWallGridDrawCache, wallGridDrawCacheHit } from "./StaticGridWallDraw.js";

const sBoxCache = { 
    grid: null, 
    wallGridRevision: -1, 
    boundsMinX: 0, 
    boundsMaxX: 0, 
    boundsMinY: 0, 
    boundsMaxY: 0, 
    gridCols: 0, 
    gridRows: 0, 
    boxes: new RailWallBoxList(),
    drawables: []
};
const sRailP1 = { x: 0, y: 0 };
const sRailP2 = { x: 0, y: 0 };

function bindRailEdge(p1, p2, x1, y1, x2, y2) {
    p1.x = x1;
    p1.y = y1;
    p2.x = x2;
    p2.y = y2;
}

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

function getRailWallBoxDrawable(data, baseIndex, index) {
    let d = sBoxCache.drawables[index];
    if (!d) {
        d = {
            isEdgeRail: true,
            _distSq: 0,
            get gridCol() { return this.data[this.baseIndex + RAIL_BOX.gridCol]; },
            get gridRow() { return this.data[this.baseIndex + RAIL_BOX.gridRow]; },
            get gridSide() { return this.data[this.baseIndex + RAIL_BOX.gridSide]; },
            get gridIdx() { return this.data[this.baseIndex + RAIL_BOX.gridIdx]; },
            get cx() { return this.data[this.baseIndex + RAIL_BOX.cx]; },
            get cy() { return this.data[this.baseIndex + RAIL_BOX.cy]; },
            get minX() { return this.data[this.baseIndex + RAIL_BOX.minX]; },
            get minY() { return this.data[this.baseIndex + RAIL_BOX.minY]; },
            get maxX() { return this.data[this.baseIndex + RAIL_BOX.maxX]; },
            get maxY() { return this.data[this.baseIndex + RAIL_BOX.maxY]; },
            get innerP1x() { return this.data[this.baseIndex + RAIL_BOX.innerP1x]; },
            get innerP1y() { return this.data[this.baseIndex + RAIL_BOX.innerP1y]; },
            get innerP2x() { return this.data[this.baseIndex + RAIL_BOX.innerP2x]; },
            get innerP2y() { return this.data[this.baseIndex + RAIL_BOX.innerP2y]; },
            get outerP1x() { return this.data[this.baseIndex + RAIL_BOX.outerP1x]; },
            get outerP1y() { return this.data[this.baseIndex + RAIL_BOX.outerP1y]; },
            get outerP2x() { return this.data[this.baseIndex + RAIL_BOX.outerP2x]; },
            get outerP2y() { return this.data[this.baseIndex + RAIL_BOX.outerP2y]; },
            get inwardX() { return this.data[this.baseIndex + RAIL_BOX.inwardX]; },
            get inwardY() { return this.data[this.baseIndex + RAIL_BOX.inwardY]; },
            get wallBaseZ() { return this.data[this.baseIndex + RAIL_BOX.wallBaseZ]; },
            get wallHeight() { return this.data[this.baseIndex + RAIL_BOX.wallHeight]; },
            get wallCapHeight() { return this.data[this.baseIndex + RAIL_BOX.wallCapHeight]; },
            get edgeThickness() { return this.data[this.baseIndex + RAIL_BOX.edgeThickness]; },
        };
        sBoxCache.drawables[index] = d;
    }
    d.data = data;
    d.baseIndex = baseIndex;
    return d;
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
    const data = boxes.data;
    for (let i = 0; i < boxes.length; i++) {
        const base = i * RAIL_BOX_STRIDE;
        if (!railWallBoxTowardViewerFlat(data, base, viewerX, viewerY)) continue;
        const cx = data[base + RAIL_BOX.cx];
        const cy = data[base + RAIL_BOX.cy];
        const viewX = cx - viewerX;
        const viewY = cy - viewerY;
        const distSq = viewX * viewX + viewY * viewY;
        const drawable = getRailWallBoxDrawable(data, base, i);
        drawable._distSq = distSq;
        out.push(drawable);
    }
    return out;
}

export function drawProjectedGridEdgeRail(ctx, drawable, viewport, state, face, skipWallCaps = false) {
    const data = drawable.data;
    const base = drawable.baseIndex;
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
    
    bindRailEdge(sRailP1, sRailP2, innerP1x, innerP1y, innerP2x, innerP2y);
    if (isOutwardFaceTowardViewer((innerP1x + innerP2x) * 0.5, (innerP1y + innerP2y) * 0.5, inwardX, inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "inner";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
    }
    
    bindRailEdge(sRailP1, sRailP2, outerP1x, outerP1y, outerP2x, outerP2y);
    if (isOutwardFaceTowardViewer((outerP1x + outerP2x) * 0.5, (outerP1y + outerP2y) * 0.5, -inwardX, -inwardY, viewerX, viewerY)) {
        face.atlasFaceId = "outer";
        drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
    }
    
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        bindRailEdge(sRailP1, sRailP2, outerP1x, outerP1y, innerP1x, innerP1y);
        if (isOutwardFaceTowardViewer((outerP1x + innerP1x) * 0.5, (outerP1y + innerP1y) * 0.5, -tx, -ty, viewerX, viewerY)) {
            face.atlasFaceId = "end0";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
        }
        bindRailEdge(sRailP1, sRailP2, innerP2x, innerP2y, outerP2x, outerP2y);
        if (isOutwardFaceTowardViewer((innerP2x + outerP2x) * 0.5, (innerP2y + outerP2y) * 0.5, tx, ty, viewerX, viewerY)) {
            face.atlasFaceId = "end1";
            drawProjectedWallFace(ctx, sRailP1, sRailP2, viewport, state, face);
        }
    }
    face.atlasFaceId = undefined;
    if (!skipWallCaps) drawProjectedRailWallCapFlat(ctx, data, base, viewport, state, face);
}

export function invalidateStaticGridEdgeRailDrawCache() {
    sBoxCache.wallGridRevision = -1;
    sBoxCache.boxes.clear();
}

