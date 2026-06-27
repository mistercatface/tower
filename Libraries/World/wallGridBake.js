import { forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { edgeNeighbor, cellEdgeEndpoints, railWallEdgeShouldEmit, railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/grid/CellEdge.js";
import { gridSettings } from "../../Config/world.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
function allocVoxelWallFace() {
    return { gridCol: 0, gridRow: 0, gridIdx: 0, gridSide: 0, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, wallBaseZ: 0, wallHeight: 0, wallCapHeight: 0, cx: 0, cy: 0, outX: 0, outY: 0 };
}
function allocRailWallBox() {
    return {
        gridCol: 0,
        gridRow: 0,
        gridIdx: 0,
        gridSide: 0,
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        innerP1x: 0,
        innerP1y: 0,
        innerP2x: 0,
        innerP2y: 0,
        outerP1x: 0,
        outerP1y: 0,
        outerP2x: 0,
        outerP2y: 0,
        inwardX: 0,
        inwardY: 0,
        wallBaseZ: 0,
        wallHeight: 0,
        wallCapHeight: 0,
        edgeThickness: 0,
        cx: 0,
        cy: 0,
    };
}
export function voxelWallFaceVisible(neighborCap, faceHeight) {
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
export function voxelWallFaceBaseZ(neighborCap, faceHeight) {
    if (neighborCap == null || faceHeight <= neighborCap) return 0;
    return neighborCap;
}
export function railWallInwardNormal(edge) {
    if (edge === 0) return { x: 0, y: 1 };
    if (edge === 1) return { x: -1, y: 0 };
    if (edge === 2) return { x: 0, y: -1 };
    return { x: 1, y: 0 };
}
export function railWallTopZAt(grid, col, row, side) {
    const edge = railWallEdgeAt(grid, col, row, side);
    if (!edge) return 0;
    return railWallHeightPx(edge, grid.cellSize, neighborFillLevel(grid, col, row, side));
}
export function railWallAtZLevel(grid, col, row, side, zLevel) {
    return railWallEdgeShouldEmit(grid, col, row, side) && railWallTopZAt(grid, col, row, side) === zLevel;
}
export function railWallFootprintHalfThickness(grid, col, row, side) {
    const railEdge = railWallEdgeAt(grid, col, row, side);
    if (!railEdge) return 0;
    return railWallThicknessPx(railEdge) / 2;
}
export function resolveRailWallNeighborContext(grid, col, row, side) {
    const fillLevel = neighborFillLevel(grid, col, row, side);
    const { nc, nr } = edgeNeighbor(col, row, side);
    let neighborFillHeightPx = 0;
    if (cellInRect(nc, nr, grid.cols, grid.rows)) neighborFillHeightPx = resolveCellWallHeightAtIdx(grid, nc + nr * grid.cols);
    const neighborCap = neighborFillHeightPx > 0 ? neighborFillHeightPx : null;
    const railEdge = railWallEdgeAt(grid, col, row, side);
    const capHeightPx = railEdge ? railWallHeightPx(railEdge, grid.cellSize, fillLevel) : 0;
    return { neighborFillLevel: fillLevel, neighborFillHeightPx, neighborCap, capHeightPx };
}
export function forEachEmittingRailWallAtZLevel(grid, aabb, zLevel, fn) {
    forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
        for (let side = 0; side < 4; side++) {
            if (!railWallAtZLevel(grid, col, row, side, zLevel)) continue;
            fn(col, row, side, idx);
        }
    });
}
export function railWallFootprintAabb(grid, col, row, edge) {
    const halfT = railWallFootprintHalfThickness(grid, col, row, edge);
    const b = grid.getCellBounds(col, row);
    if (edge === 0) return { minX: b.minX, minY: b.minY - halfT, maxX: b.maxX, maxY: b.minY + halfT };
    if (edge === 1) return { minX: b.maxX - halfT, minY: b.minY, maxX: b.maxX + halfT, maxY: b.maxY };
    if (edge === 2) return { minX: b.minX, minY: b.maxY - halfT, maxX: b.maxX, maxY: b.maxY + halfT };
    return { minX: b.minX - halfT, minY: b.minY, maxX: b.minX + halfT, maxY: b.maxY };
}
export function railWallCapUvCornersInto(out4, grid, box) {
    const b = grid.getCellBounds(box.gridCol, box.gridRow);
    if (box.gridSide === 0) {
        out4[0].x = b.minX;
        out4[0].y = b.minY;
        out4[1].x = b.maxX;
        out4[1].y = b.minY;
        out4[2].x = b.maxX;
        out4[2].y = b.maxY;
        out4[3].x = b.minX;
        out4[3].y = b.maxY;
        return out4;
    }
    if (box.gridSide === 1) {
        out4[0].x = b.maxX;
        out4[0].y = b.minY;
        out4[1].x = b.maxX;
        out4[1].y = b.maxY;
        out4[2].x = b.minX;
        out4[2].y = b.maxY;
        out4[3].x = b.minX;
        out4[3].y = b.minY;
        return out4;
    }
    if (box.gridSide === 2) {
        out4[0].x = b.maxX;
        out4[0].y = b.maxY;
        out4[1].x = b.minX;
        out4[1].y = b.maxY;
        out4[2].x = b.minX;
        out4[2].y = b.minY;
        out4[3].x = b.maxX;
        out4[3].y = b.minY;
        return out4;
    }
    out4[0].x = b.minX;
    out4[0].y = b.maxY;
    out4[1].x = b.minX;
    out4[1].y = b.minY;
    out4[2].x = b.maxX;
    out4[2].y = b.minY;
    out4[3].x = b.maxX;
    out4[3].y = b.maxY;
    return out4;
}
function railWallSideEndpoints(grid, col, row, edge, railSide, p1, p2) {
    const halfT = railWallFootprintHalfThickness(grid, col, row, edge);
    const b = grid.getCellBounds(col, row);
    if (edge === 0) {
        const y = railSide === 0 ? b.minY + halfT : b.minY - halfT;
        p1.x = b.minX;
        p1.y = y;
        p2.x = b.maxX;
        p2.y = y;
    } else if (edge === 2) {
        const y = railSide === 0 ? b.maxY - halfT : b.maxY + halfT;
        p1.x = b.maxX;
        p1.y = y;
        p2.x = b.minX;
        p2.y = y;
    } else if (edge === 1) {
        const x = railSide === 0 ? b.maxX - halfT : b.maxX + halfT;
        p1.x = x;
        p1.y = b.minY;
        p2.x = x;
        p2.y = b.maxY;
    } else {
        const x = railSide === 0 ? b.minX + halfT : b.minX - halfT;
        p1.x = x;
        p1.y = b.maxY;
        p2.x = x;
        p2.y = b.minY;
    }
}
export function writeRailWallBoxInto(box, grid, col, row, edge) {
    if (!railWallEdgeShouldEmit(grid, col, row, edge)) return false;
    const cols = grid.cols;
    const idx = col + row * cols;
    const railEdge = railWallEdgeAt(grid, col, row, edge);
    if (!railEdge) return false;
    const { neighborCap, capHeightPx: edgeHeight } = resolveRailWallNeighborContext(grid, col, row, edge);
    if (edgeHeight <= 0) return false;
    if (!voxelWallFaceVisible(neighborCap, edgeHeight)) return false;
    clearWallGridDrawableDrawMemos(box);
    const fp = railWallFootprintAabb(grid, col, row, edge);
    const inward = railWallInwardNormal(edge);
    railWallSideEndpoints(grid, col, row, edge, 0, sP1, sP2);
    box.gridCol = col;
    box.gridRow = row;
    box.gridIdx = idx;
    box.gridSide = edge;
    box.minX = fp.minX;
    box.minY = fp.minY;
    box.maxX = fp.maxX;
    box.maxY = fp.maxY;
    box.innerP1x = sP1.x;
    box.innerP1y = sP1.y;
    box.innerP2x = sP2.x;
    box.innerP2y = sP2.y;
    railWallSideEndpoints(grid, col, row, edge, 1, sP1, sP2);
    box.outerP1x = sP1.x;
    box.outerP1y = sP1.y;
    box.outerP2x = sP2.x;
    box.outerP2y = sP2.y;
    box.inwardX = inward.x;
    box.inwardY = inward.y;
    box.wallBaseZ = voxelWallFaceBaseZ(neighborCap, edgeHeight);
    box.wallHeight = edgeHeight - box.wallBaseZ;
    box.wallCapHeight = edgeHeight;
    box.edgeThickness = railWallThicknessPx(railEdge);
    box.cx = (fp.minX + fp.maxX) * 0.5;
    box.cy = (fp.minY + fp.maxY) * 0.5;
    return true;
}
export function resolveRailWallBox(grid, col, row, edge) {
    const box = allocRailWallBox();
    return writeRailWallBoxInto(box, grid, col, row, edge) ? box : null;
}
function clearWallGridDrawableDrawMemos(drawable) {
    delete drawable._wallAtlasStashes;
    delete drawable._cachedProfileId;
    delete drawable._faceSubdiv;
    delete drawable._faceSubdivKey;
}
function extendCollinearRailWallBox(cur, next) {
    cur.minX = Math.min(cur.minX, next.minX);
    cur.minY = Math.min(cur.minY, next.minY);
    cur.maxX = Math.max(cur.maxX, next.maxX);
    cur.maxY = Math.max(cur.maxY, next.maxY);
    const edge = cur.gridSide;
    if (edge === 0) {
        cur.innerP1x = cur.minX;
        cur.innerP1y = cur.maxY;
        cur.innerP2x = cur.maxX;
        cur.innerP2y = cur.maxY;
        cur.outerP1x = cur.minX;
        cur.outerP1y = cur.minY;
        cur.outerP2x = cur.maxX;
        cur.outerP2y = cur.minY;
    } else if (edge === 2) {
        cur.innerP1x = cur.maxX;
        cur.innerP1y = cur.minY;
        cur.innerP2x = cur.minX;
        cur.innerP2y = cur.minY;
        cur.outerP1x = cur.maxX;
        cur.outerP1y = cur.maxY;
        cur.outerP2x = cur.minX;
        cur.outerP2y = cur.maxY;
    } else if (edge === 1) {
        cur.innerP1x = cur.minX;
        cur.innerP1y = cur.minY;
        cur.innerP2x = cur.minX;
        cur.innerP2y = cur.maxY;
        cur.outerP1x = cur.maxX;
        cur.outerP1y = cur.minY;
        cur.outerP2x = cur.maxX;
        cur.outerP2y = cur.maxY;
    } else {
        cur.innerP1x = cur.maxX;
        cur.innerP1y = cur.maxY;
        cur.innerP2x = cur.maxX;
        cur.innerP2y = cur.minY;
        cur.outerP1x = cur.minX;
        cur.outerP1y = cur.maxY;
        cur.outerP2x = cur.minX;
        cur.outerP2y = cur.minY;
    }
    cur.cx = (cur.minX + cur.maxX) * 0.5;
    cur.cy = (cur.minY + cur.maxY) * 0.5;
    clearWallGridDrawableDrawMemos(cur);
}
function collinearRailWallBoxesAdjacent(a, b) {
    if (a.gridSide !== b.gridSide) return false;
    if (a.wallCapHeight !== b.wallCapHeight || a.wallBaseZ !== b.wallBaseZ || a.edgeThickness !== b.edgeThickness) return false;
    if (a.inwardX !== b.inwardX || a.inwardY !== b.inwardY) return false;
    const cellsPerChunk = gridSettings.minCellsPerChunk;
    if (a.gridSide === 0 || a.gridSide === 2) {
        if (a.gridRow !== b.gridRow) return false;
        if (Math.floor(a.gridCol / cellsPerChunk) !== Math.floor(b.gridCol / cellsPerChunk)) return false;
        return b.gridCol === a.gridCol + 1;
    }
    if (a.gridCol !== b.gridCol) return false;
    if (Math.floor(a.gridRow / cellsPerChunk) !== Math.floor(b.gridRow / cellsPerChunk)) return false;
    return b.gridRow === a.gridRow + 1;
}
function mergeCollinearRailWallBoxesInPlace(boxes) {
    const n = boxes.length;
    if (n <= 1) return n;
    boxes.sort((a, b) => {
        if (a.gridSide !== b.gridSide) return a.gridSide - b.gridSide;
        if (a.wallCapHeight !== b.wallCapHeight) return a.wallCapHeight - b.wallCapHeight;
        if (a.wallBaseZ !== b.wallBaseZ) return a.wallBaseZ - b.wallBaseZ;
        if (a.edgeThickness !== b.edgeThickness) return a.edgeThickness - b.edgeThickness;
        if (a.gridSide === 0 || a.gridSide === 2) {
            if (a.gridRow !== b.gridRow) return a.gridRow - b.gridRow;
            return a.gridCol - b.gridCol;
        }
        if (a.gridCol !== b.gridCol) return a.gridCol - b.gridCol;
        return a.gridRow - b.gridRow;
    });
    let write = 1;
    let cur = boxes[0];
    for (let i = 1; i < n; i++) {
        const next = boxes[i];
        if (collinearRailWallBoxesAdjacent(cur, next)) extendCollinearRailWallBox(cur, next);
        else {
            cur = next;
            boxes[write++] = cur;
        }
    }
    return write;
}
export function mergeCollinearRailWallBoxes(boxes) {
    boxes.length = mergeCollinearRailWallBoxesInPlace(boxes);
    return boxes;
}
export function writeVoxelWallFaceInto(face, grid, col, row, edge) {
    const cols = grid.cols;
    const idx = col + row * cols;
    const fillHeight = resolveCellWallHeightAtIdx(grid, idx);
    const storedEdge = railWallEdgeAt(grid, col, row, edge);
    const edgeLevel = storedEdge ? railWallCapLevel(storedEdge, neighborFillLevel(grid, col, row, edge)) : 0;
    if (edgeLevel > 0) return false;
    if (fillHeight === 0) return false;
    const faceHeight = fillHeight;
    const { nc, nr } = edgeNeighbor(col, row, edge);
    let neighborFillHeight = 0;
    if (cellInRect(nc, nr, cols, grid.rows)) neighborFillHeight = resolveCellWallHeightAtIdx(grid, nc + nr * cols);
    const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
    if (!voxelWallFaceVisible(neighborCap, faceHeight)) return false;
    clearWallGridDrawableDrawMemos(face);
    cellEdgeEndpoints(grid, col, row, edge, sP1, sP2, 0);
    const cellBounds = grid.getCellBounds(col, row);
    const cx = (cellBounds.minX + cellBounds.maxX) / 2;
    const cy = (cellBounds.minY + cellBounds.maxY) / 2;
    const ecx = (sP1.x + sP2.x) / 2;
    const ecy = (sP1.y + sP2.y) / 2;
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, faceHeight);
    face.gridCol = col;
    face.gridRow = row;
    face.gridIdx = idx;
    face.gridSide = edge;
    face.p1.x = sP1.x;
    face.p1.y = sP1.y;
    face.p2.x = sP2.x;
    face.p2.y = sP2.y;
    face.wallBaseZ = wallBaseZ;
    face.wallHeight = faceHeight - wallBaseZ;
    face.wallCapHeight = faceHeight;
    face.cx = ecx;
    face.cy = ecy;
    face.outX = ecx - cx;
    face.outY = ecy - cy;
    return true;
}
export function resolveVoxelWallFace(grid, col, row, edge) {
    const face = allocVoxelWallFace();
    return writeVoxelWallFaceInto(face, grid, col, row, edge) ? face : null;
}
export function collectVoxelWallFacesInAabb(grid, bounds, out) {
    let write = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(grid, idx) === 0) return;
        for (let edge = 0; edge < 4; edge++) {
            const face = out[write] ?? (out[write] = allocVoxelWallFace());
            if (writeVoxelWallFaceInto(face, grid, col, row, edge)) write++;
        }
    });
    out.length = write;
}
export function collectRailWallBoxesInAabb(grid, bounds, out) {
    let write = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (!grid.edgeStore.hasAnyAtIdx(idx)) return;
        for (let edge = 0; edge < 4; edge++) {
            const box = out[write] ?? (out[write] = allocRailWallBox());
            if (writeRailWallBoxInto(box, grid, col, row, edge)) write++;
        }
    });
    out.length = write;
    out.length = mergeCollinearRailWallBoxesInPlace(out);
}
export function defaultWallCapPx(settings) {
    return settings.wallHeightCells * settings.cellSize;
}
export function resolveWallCapHeightPx(capHeight, settings) {
    return capHeight ?? defaultWallCapPx(settings);
}
export function chunkHasStaticRoofAtLevel(obstacleGrid, bounds, zLevel) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, bounds, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) === zLevel) found = true;
    });
    return found;
}
export function chunkHasStaticStructureAtLevel(obstacleGrid, bounds, zLevel) {
    return chunkHasStaticRoofAtLevel(obstacleGrid, bounds, zLevel) || chunkHasStaticEdgeRailsAtLevel(obstacleGrid, bounds, zLevel);
}
export function chunkHasStaticEdgeRailsAtLevel(obstacleGrid, bounds, zLevel) {
    let found = false;
    forEachEmittingRailWallAtZLevel(obstacleGrid, bounds, zLevel, () => {
        found = true;
    });
    return found;
}
