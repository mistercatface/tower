import { forEachObstacleGridCellInAabb, chunkWorldAabbScratch } from "../Spatial/grid/GridCoords.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { edgeNeighbor, cellEdgeEndpoints, railWallEdgeShouldEmit, railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/grid/CellEdge.js";
import { gridSettings } from "../../Config/balance/grid.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
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
    const neighborFillLevel = neighborFillLevel(grid, col, row, side);
    const { nc, nr } = edgeNeighbor(col, row, side);
    let neighborFillHeightPx = 0;
    if (cellInRect(nc, nr, grid.cols, grid.rows)) neighborFillHeightPx = resolveCellWallHeightAtIdx(grid, nc + nr * grid.cols);
    const neighborCap = neighborFillHeightPx > 0 ? neighborFillHeightPx : null;
    const railEdge = railWallEdgeAt(grid, col, row, side);
    const capHeightPx = railEdge ? railWallHeightPx(railEdge, grid.cellSize, neighborFillLevel) : 0;
    return { neighborFillLevel, neighborFillHeightPx, neighborCap, capHeightPx };
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
export function railWallCapUvCorners(grid, box) {
    const b = grid.getCellBounds(box.gridCol, box.gridRow);
    if (box.gridSide === 0)
        return [
            { x: b.minX, y: b.minY },
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY },
        ];
    if (box.gridSide === 1)
        return [
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY },
            { x: b.minX, y: b.minY },
        ];
    if (box.gridSide === 2)
        return [
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY },
            { x: b.minX, y: b.minY },
            { x: b.maxX, y: b.minY },
        ];
    return [
        { x: b.minX, y: b.maxY },
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
    ];
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
export function resolveRailWallBox(grid, col, row, edge) {
    if (!railWallEdgeShouldEmit(grid, col, row, edge)) return null;
    const cols = grid.cols;
    const idx = col + row * cols;
    const railEdge = railWallEdgeAt(grid, col, row, edge);
    if (!railEdge) return null;
    const { neighborCap, capHeightPx: edgeHeight } = resolveRailWallNeighborContext(grid, col, row, edge);
    if (edgeHeight <= 0) return null;
    if (!voxelWallFaceVisible(neighborCap, edgeHeight)) return null;
    const fp = railWallFootprintAabb(grid, col, row, edge);
    const inward = railWallInwardNormal(edge);
    railWallSideEndpoints(grid, col, row, edge, 0, sP1, sP2);
    const innerP1x = sP1.x;
    const innerP1y = sP1.y;
    const innerP2x = sP2.x;
    const innerP2y = sP2.y;
    railWallSideEndpoints(grid, col, row, edge, 1, sP1, sP2);
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, edgeHeight);
    return {
        staticGridEdgeRail: true,
        gridCol: col,
        gridRow: row,
        gridIdx: idx,
        gridSide: edge,
        minX: fp.minX,
        minY: fp.minY,
        maxX: fp.maxX,
        maxY: fp.maxY,
        innerP1x,
        innerP1y,
        innerP2x,
        innerP2y,
        outerP1x: sP1.x,
        outerP1y: sP1.y,
        outerP2x: sP2.x,
        outerP2y: sP2.y,
        inwardX: inward.x,
        inwardY: inward.y,
        wallBaseZ,
        wallHeight: edgeHeight - wallBaseZ,
        wallCapHeight: edgeHeight,
        edgeThickness: railWallThicknessPx(railEdge),
        cx: (fp.minX + fp.maxX) * 0.5,
        cy: (fp.minY + fp.maxY) * 0.5,
    };
}
function clearRailWallBoxDrawMemos(box) {
    delete box._wallAtlasStashes;
    delete box._wkByFace;
    delete box._cachedProfileId;
    delete box._faceSubdiv;
    delete box._faceSubdivKey;
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
    clearRailWallBoxDrawMemos(cur);
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
export function mergeCollinearRailWallBoxes(boxes) {
    if (boxes.length <= 1) return boxes;
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
    const merged = [];
    let cur = boxes[0];
    merged.push(cur);
    for (let i = 1; i < boxes.length; i++) {
        const next = boxes[i];
        if (collinearRailWallBoxesAdjacent(cur, next)) extendCollinearRailWallBox(cur, next);
        else {
            cur = next;
            merged.push(cur);
        }
    }
    return merged;
}
export function resolveVoxelWallFace(grid, col, row, edge) {
    const cols = grid.cols;
    const idx = col + row * cols;
    const fillHeight = resolveCellWallHeightAtIdx(grid, idx);
    const storedEdge = railWallEdgeAt(grid, col, row, edge);
    const edgeLevel = storedEdge ? railWallCapLevel(storedEdge, neighborFillLevel(grid, col, row, edge)) : 0;
    if (edgeLevel > 0) return null;
    if (fillHeight === 0) return null;
    const faceHeight = fillHeight;
    const { nc, nr } = edgeNeighbor(col, row, edge);
    let neighborFillHeight = 0;
    if (cellInRect(nc, nr, cols, grid.rows)) neighborFillHeight = resolveCellWallHeightAtIdx(grid, nc + nr * cols);
    const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
    if (!voxelWallFaceVisible(neighborCap, faceHeight)) return null;
    cellEdgeEndpoints(grid, col, row, edge, sP1, sP2, 0);
    const cellBounds = grid.getCellBounds(col, row);
    const cx = (cellBounds.minX + cellBounds.maxX) / 2;
    const cy = (cellBounds.minY + cellBounds.maxY) / 2;
    const ecx = (sP1.x + sP2.x) / 2;
    const ecy = (sP1.y + sP2.y) / 2;
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, faceHeight);
    return {
        staticGrid: true,
        gridCol: col,
        gridRow: row,
        gridIdx: idx,
        gridSide: edge,
        p1: { x: sP1.x, y: sP1.y },
        p2: { x: sP2.x, y: sP2.y },
        wallBaseZ,
        wallHeight: faceHeight - wallBaseZ,
        wallCapHeight: faceHeight,
        cx: ecx,
        cy: ecy,
        outX: ecx - cx,
        outY: ecy - cy,
    };
}
export function collectVoxelWallFacesInAabb(grid, bounds, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(grid, idx) === 0) return;
        for (let edge = 0; edge < 4; edge++) {
            const face = resolveVoxelWallFace(grid, col, row, edge);
            if (face) out.push(face);
        }
    });
}
export function collectRailWallBoxesInAabb(grid, bounds, out) {
    out.length = 0;
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (!grid.edgeStore.hasAnyAtIdx(idx)) return;
        for (let edge = 0; edge < 4; edge++) {
            const box = resolveRailWallBox(grid, col, row, edge);
            if (box) out.push(box);
        }
    });
    const merged = mergeCollinearRailWallBoxes(out);
    out.length = 0;
    for (let i = 0; i < merged.length; i++) out.push(merged[i]);
}
export function defaultWallHeightPx(settings) {
    return settings.wallHeight;
}
export function resolveSegmentWallHeightPx(segment, settings) {
    return segment?.wallHeight ?? settings.wallHeight;
}
export function resolveWallCapHeightPx(capHeight, settings) {
    return capHeight ?? settings.wallHeight;
}
export function chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    let found = false;
    forEachObstacleGridCellInAabb(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(obstacleGrid, idx) === zLevel) found = true;
    });
    return found;
}
export function chunkHasStaticStructureAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    return chunkHasStaticRoofAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) || chunkHasStaticEdgeRailsAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel);
}
export function chunkHasStaticEdgeRailsAtLevel(obstacleGrid, chunkOriginX, chunkOriginY, chunkSizePx, zLevel) {
    let found = false;
    forEachEmittingRailWallAtZLevel(obstacleGrid, chunkWorldAabbScratch(chunkOriginX, chunkOriginY, chunkSizePx), zLevel, () => {
        found = true;
    });
    return found;
}
