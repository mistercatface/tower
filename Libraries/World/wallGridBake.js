import { cellToChunkCoord, forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { cellEdgeEndpoints, railWallEdgeShouldEmit, railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx, edgeNeighborIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/grid/CellEdgeStore.js";
import { gridSettings } from "../../Config/world.js";
import { StrideFloatList } from "./StrideFloatList.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
export const RAIL_BOX = {
    gridCol: 0,
    gridRow: 1,
    chunkCol: 2,
    chunkRow: 3,
    gridIdx: 4,
    gridSide: 5,
    minX: 6,
    minY: 7,
    maxX: 8,
    maxY: 9,
    innerP1x: 10,
    innerP1y: 11,
    innerP2x: 12,
    innerP2y: 13,
    outerP1x: 14,
    outerP1y: 15,
    outerP2x: 16,
    outerP2y: 17,
    inwardX: 18,
    inwardY: 19,
    wallBaseZ: 20,
    wallHeight: 21,
    wallCapHeight: 22,
    edgeThickness: 23,
    cx: 24,
    cy: 25,
};
export const RAIL_BOX_STRIDE = 26;
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
export function railWallTopZAt(grid, idx, side) {
    const edge = railWallEdgeAt(grid, idx, side);
    if (!edge) return 0;
    return railWallHeightPx(edge, grid.cellSize, neighborFillLevel(grid, idx, side));
}
export function railWallAtZLevel(grid, idx, side, zLevel) {
    return railWallEdgeShouldEmit(grid, idx, side) && railWallTopZAt(grid, idx, side) === zLevel;
}
export function railWallFootprintHalfThickness(grid, idx, side) {
    const railEdge = railWallEdgeAt(grid, idx, side);
    if (!railEdge) return 0;
    return railWallThicknessPx(railEdge) / 2;
}
export function resolveRailWallNeighborContext(grid, idx, side) {
    const fillLevel = neighborFillLevel(grid, idx, side);
    const nIdx = edgeNeighborIdx(idx, side, grid.cols, grid.rows);
    let neighborFillHeightPx = 0;
    if (nIdx !== -1) neighborFillHeightPx = resolveCellWallHeightAtIdx(grid, nIdx);
    const neighborCap = neighborFillHeightPx > 0 ? neighborFillHeightPx : null;
    const railEdge = railWallEdgeAt(grid, idx, side);
    const capHeightPx = railEdge ? railWallHeightPx(railEdge, grid.cellSize, fillLevel) : 0;
    return { neighborFillLevel: fillLevel, neighborFillHeightPx, neighborCap, capHeightPx };
}
export function forEachEmittingRailWallAtZLevel(grid, aabb, zLevel, fn) {
    forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
        for (let side = 0; side < 4; side++) {
            if (!railWallAtZLevel(grid, idx, side, zLevel)) continue;
            fn(col, row, side, idx);
        }
    });
}
export function railWallFootprintAabb(grid, col, row, edge) {
    const halfT = railWallFootprintHalfThickness(grid, colRowToIndex(col, row, grid.cols), edge);
    const b = grid.getCellBounds(col, row);
    if (edge === 0) return { minX: b.minX, minY: b.minY - halfT, maxX: b.maxX, maxY: b.minY + halfT };
    if (edge === 1) return { minX: b.maxX - halfT, minY: b.minY, maxX: b.maxX + halfT, maxY: b.maxY };
    if (edge === 2) return { minX: b.minX, minY: b.maxY - halfT, maxX: b.maxX, maxY: b.maxY + halfT };
    return { minX: b.minX - halfT, minY: b.minY, maxX: b.minX + halfT, maxY: b.maxY };
}
export function flatRailWallCapUvCornersIntoFlat(out8, grid, data, base) {
    const col = data[base + RAIL_BOX.gridCol];
    const row = data[base + RAIL_BOX.gridRow];
    const side = data[base + RAIL_BOX.gridSide];
    const b = grid.getCellBounds(col, row);
    return fillFlatUvFromBounds(out8, b, side);
}
function fillFlatUvFromBounds(out8, b, side) {
    if (side === 0) {
        out8[0] = b.minX;
        out8[1] = b.minY;
        out8[2] = b.maxX;
        out8[3] = b.minY;
        out8[4] = b.maxX;
        out8[5] = b.maxY;
        out8[6] = b.minX;
        out8[7] = b.maxY;
    } else if (side === 1) {
        out8[0] = b.maxX;
        out8[1] = b.minY;
        out8[2] = b.maxX;
        out8[3] = b.maxY;
        out8[4] = b.minX;
        out8[5] = b.maxY;
        out8[6] = b.minX;
        out8[7] = b.minY;
    } else if (side === 2) {
        out8[0] = b.maxX;
        out8[1] = b.maxY;
        out8[2] = b.minX;
        out8[3] = b.maxY;
        out8[4] = b.minX;
        out8[5] = b.minY;
        out8[6] = b.maxX;
        out8[7] = b.minY;
    } else {
        out8[0] = b.minX;
        out8[1] = b.maxY;
        out8[2] = b.minX;
        out8[3] = b.minY;
        out8[4] = b.maxX;
        out8[5] = b.minY;
        out8[6] = b.maxX;
        out8[7] = b.maxY;
    }
    return out8;
}
function railWallSideEndpoints(grid, col, row, edge, railSide, p1, p2) {
    const halfT = railWallFootprintHalfThickness(grid, colRowToIndex(col, row, grid.cols), edge);
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
function writeRailWallBoxRecordInto(data, recordIndex, grid, col, row, edge) {
    const cols = grid.cols;
    const idx = col + row * cols;
    if (!railWallEdgeShouldEmit(grid, idx, edge)) return false;
    const railEdge = railWallEdgeAt(grid, idx, edge);
    if (!railEdge) return false;
    const { neighborCap, capHeightPx: edgeHeight } = resolveRailWallNeighborContext(grid, idx, edge);
    if (edgeHeight <= 0) return false;
    if (!voxelWallFaceVisible(neighborCap, edgeHeight)) return false;
    const fp = railWallFootprintAabb(grid, col, row, edge);
    const inward = railWallInwardNormal(edge);
    railWallSideEndpoints(grid, col, row, edge, 0, sP1, sP2);
    const base = recordIndex * RAIL_BOX_STRIDE;
    data[base + RAIL_BOX.gridCol] = col;
    data[base + RAIL_BOX.gridRow] = row;
    data[base + RAIL_BOX.chunkCol] = cellToChunkCoord(col, gridSettings.minCellsPerChunk);
    data[base + RAIL_BOX.chunkRow] = cellToChunkCoord(row, gridSettings.minCellsPerChunk);
    data[base + RAIL_BOX.gridIdx] = idx;
    data[base + RAIL_BOX.gridSide] = edge;
    data[base + RAIL_BOX.minX] = fp.minX;
    data[base + RAIL_BOX.minY] = fp.minY;
    data[base + RAIL_BOX.maxX] = fp.maxX;
    data[base + RAIL_BOX.maxY] = fp.maxY;
    data[base + RAIL_BOX.innerP1x] = sP1.x;
    data[base + RAIL_BOX.innerP1y] = sP1.y;
    data[base + RAIL_BOX.innerP2x] = sP2.x;
    data[base + RAIL_BOX.innerP2y] = sP2.y;
    railWallSideEndpoints(grid, col, row, edge, 1, sP1, sP2);
    data[base + RAIL_BOX.outerP1x] = sP1.x;
    data[base + RAIL_BOX.outerP1y] = sP1.y;
    data[base + RAIL_BOX.outerP2x] = sP2.x;
    data[base + RAIL_BOX.outerP2y] = sP2.y;
    data[base + RAIL_BOX.inwardX] = inward.x;
    data[base + RAIL_BOX.inwardY] = inward.y;
    data[base + RAIL_BOX.wallBaseZ] = voxelWallFaceBaseZ(neighborCap, edgeHeight);
    data[base + RAIL_BOX.wallHeight] = edgeHeight - data[base + RAIL_BOX.wallBaseZ];
    data[base + RAIL_BOX.wallCapHeight] = edgeHeight;
    data[base + RAIL_BOX.edgeThickness] = railWallThicknessPx(railEdge);
    data[base + RAIL_BOX.cx] = (fp.minX + fp.maxX) * 0.5;
    data[base + RAIL_BOX.cy] = (fp.minY + fp.maxY) * 0.5;
    return true;
}
function clearWallGridDrawableDrawMemos(drawable) {
    delete drawable._wallAtlasStashes;
    delete drawable._faceSubdiv;
    delete drawable._faceSubdivKey;
}
function extendCollinearRailWallBoxRecord(data, curIndex, nextIndex) {
    const cur = curIndex * RAIL_BOX_STRIDE;
    const next = nextIndex * RAIL_BOX_STRIDE;
    data[cur + RAIL_BOX.minX] = Math.min(data[cur + RAIL_BOX.minX], data[next + RAIL_BOX.minX]);
    data[cur + RAIL_BOX.minY] = Math.min(data[cur + RAIL_BOX.minY], data[next + RAIL_BOX.minY]);
    data[cur + RAIL_BOX.maxX] = Math.max(data[cur + RAIL_BOX.maxX], data[next + RAIL_BOX.maxX]);
    data[cur + RAIL_BOX.maxY] = Math.max(data[cur + RAIL_BOX.maxY], data[next + RAIL_BOX.maxY]);
    const edge = data[cur + RAIL_BOX.gridSide];
    if (edge === 0) {
        data[cur + RAIL_BOX.innerP1x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.innerP1y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.innerP2x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.innerP2y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.outerP1x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.outerP1y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.outerP2x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.outerP2y] = data[cur + RAIL_BOX.minY];
    } else if (edge === 2) {
        data[cur + RAIL_BOX.innerP1x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.innerP1y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.innerP2x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.innerP2y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.outerP1x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.outerP1y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.outerP2x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.outerP2y] = data[cur + RAIL_BOX.maxY];
    } else if (edge === 1) {
        data[cur + RAIL_BOX.innerP1x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.innerP1y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.innerP2x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.innerP2y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.outerP1x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.outerP1y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.outerP2x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.outerP2y] = data[cur + RAIL_BOX.maxY];
    } else {
        data[cur + RAIL_BOX.innerP1x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.innerP1y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.innerP2x] = data[cur + RAIL_BOX.maxX];
        data[cur + RAIL_BOX.innerP2y] = data[cur + RAIL_BOX.minY];
        data[cur + RAIL_BOX.outerP1x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.outerP1y] = data[cur + RAIL_BOX.maxY];
        data[cur + RAIL_BOX.outerP2x] = data[cur + RAIL_BOX.minX];
        data[cur + RAIL_BOX.outerP2y] = data[cur + RAIL_BOX.minY];
    }
    data[cur + RAIL_BOX.cx] = (data[cur + RAIL_BOX.minX] + data[cur + RAIL_BOX.maxX]) * 0.5;
    data[cur + RAIL_BOX.cy] = (data[cur + RAIL_BOX.minY] + data[cur + RAIL_BOX.maxY]) * 0.5;
}
function collinearRailWallBoxRecordsAdjacent(data, aIndex, bIndex) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX.gridSide] !== data[b + RAIL_BOX.gridSide]) return false;
    if (
        data[a + RAIL_BOX.wallCapHeight] !== data[b + RAIL_BOX.wallCapHeight] ||
        data[a + RAIL_BOX.wallBaseZ] !== data[b + RAIL_BOX.wallBaseZ] ||
        data[a + RAIL_BOX.edgeThickness] !== data[b + RAIL_BOX.edgeThickness]
    )
        return false;
    if (data[a + RAIL_BOX.inwardX] !== data[b + RAIL_BOX.inwardX] || data[a + RAIL_BOX.inwardY] !== data[b + RAIL_BOX.inwardY]) return false;
    if (data[a + RAIL_BOX.gridSide] === 0 || data[a + RAIL_BOX.gridSide] === 2) {
        if (data[a + RAIL_BOX.gridRow] !== data[b + RAIL_BOX.gridRow]) return false;
        if (data[a + RAIL_BOX.chunkCol] !== data[b + RAIL_BOX.chunkCol]) return false;
        return data[b + RAIL_BOX.gridCol] === data[a + RAIL_BOX.gridCol] + 1;
    }
    if (data[a + RAIL_BOX.gridCol] !== data[b + RAIL_BOX.gridCol]) return false;
    if (data[a + RAIL_BOX.chunkRow] !== data[b + RAIL_BOX.chunkRow]) return false;
    return data[b + RAIL_BOX.gridRow] === data[a + RAIL_BOX.gridRow] + 1;
}
function compareRailWallBoxRecords(data, aIndex, bIndex) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX.gridSide] !== data[b + RAIL_BOX.gridSide]) return data[a + RAIL_BOX.gridSide] - data[b + RAIL_BOX.gridSide];
    if (data[a + RAIL_BOX.wallCapHeight] !== data[b + RAIL_BOX.wallCapHeight]) return data[a + RAIL_BOX.wallCapHeight] - data[b + RAIL_BOX.wallCapHeight];
    if (data[a + RAIL_BOX.wallBaseZ] !== data[b + RAIL_BOX.wallBaseZ]) return data[a + RAIL_BOX.wallBaseZ] - data[b + RAIL_BOX.wallBaseZ];
    if (data[a + RAIL_BOX.edgeThickness] !== data[b + RAIL_BOX.edgeThickness]) return data[a + RAIL_BOX.edgeThickness] - data[b + RAIL_BOX.edgeThickness];
    if (data[a + RAIL_BOX.gridSide] === 0 || data[a + RAIL_BOX.gridSide] === 2) {
        if (data[a + RAIL_BOX.gridRow] !== data[b + RAIL_BOX.gridRow]) return data[a + RAIL_BOX.gridRow] - data[b + RAIL_BOX.gridRow];
        return data[a + RAIL_BOX.gridCol] - data[b + RAIL_BOX.gridCol];
    }
    if (data[a + RAIL_BOX.gridCol] !== data[b + RAIL_BOX.gridCol]) return data[a + RAIL_BOX.gridCol] - data[b + RAIL_BOX.gridCol];
    return data[a + RAIL_BOX.gridRow] - data[b + RAIL_BOX.gridRow];
}
function copyRailWallBoxRecord(data, dstIndex, src, srcIndex) {
    const dst = dstIndex * RAIL_BOX_STRIDE;
    const start = srcIndex * RAIL_BOX_STRIDE;
    for (let i = 0; i < RAIL_BOX_STRIDE; i++) data[dst + i] = src[start + i];
}
function mergeCollinearRailWallBoxRecordsInPlace(list) {
    const n = list.length;
    if (n <= 1) return n;
    const { data } = list;
    const order = new Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => compareRailWallBoxRecords(data, a, b));
    const scratch = new Float32Array(n * RAIL_BOX_STRIDE);
    for (let i = 0; i < n; i++) copyRailWallBoxRecord(scratch, i, data, order[i]);
    data.set(scratch);
    let write = 1;
    let cur = 0;
    for (let i = 1; i < n; i++)
        if (collinearRailWallBoxRecordsAdjacent(data, cur, i)) extendCollinearRailWallBoxRecord(data, cur, i);
        else {
            cur = write;
            if (cur !== i) copyRailWallBoxRecord(data, cur, data, i);
            write++;
        }
    return write;
}
export const VOXEL_FACE = { gridCol: 0, gridRow: 1, gridIdx: 2, gridSide: 3, x1: 4, y1: 5, x2: 6, y2: 7, wallBaseZ: 8, wallHeight: 9, wallCapHeight: 10, cx: 11, cy: 12, outX: 13, outY: 14 };
export const VOXEL_FACE_STRIDE = 15;
export function writeVoxelWallFaceIntoFlat(data, baseIndex, grid, col, row, edge) {
    const base = baseIndex * VOXEL_FACE_STRIDE;
    const cols = grid.cols;
    const idx = col + row * cols;
    const fillHeight = resolveCellWallHeightAtIdx(grid, idx);
    const storedEdge = railWallEdgeAt(grid, idx, edge);
    const edgeLevel = storedEdge ? railWallCapLevel(storedEdge, neighborFillLevel(grid, idx, edge)) : 0;
    if (edgeLevel > 0) return false;
    if (fillHeight === 0) return false;
    const faceHeight = fillHeight;
    const nIdx = edgeNeighborIdx(idx, edge, cols, grid.rows);
    let neighborFillHeight = 0;
    if (nIdx !== -1) neighborFillHeight = resolveCellWallHeightAtIdx(grid, nIdx);
    const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
    if (!voxelWallFaceVisible(neighborCap, faceHeight)) return false;
    cellEdgeEndpoints(grid, col, row, edge, sP1, sP2, 0);
    const cellBounds = grid.getCellBounds(col, row);
    const cx = (cellBounds.minX + cellBounds.maxX) / 2;
    const cy = (cellBounds.minY + cellBounds.maxY) / 2;
    const ecx = (sP1.x + sP2.x) / 2;
    const ecy = (sP1.y + sP2.y) / 2;
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, faceHeight);
    data[base + VOXEL_FACE.gridCol] = col;
    data[base + VOXEL_FACE.gridRow] = row;
    data[base + VOXEL_FACE.gridIdx] = idx;
    data[base + VOXEL_FACE.gridSide] = edge;
    data[base + VOXEL_FACE.x1] = sP1.x;
    data[base + VOXEL_FACE.y1] = sP1.y;
    data[base + VOXEL_FACE.x2] = sP2.x;
    data[base + VOXEL_FACE.y2] = sP2.y;
    data[base + VOXEL_FACE.wallBaseZ] = wallBaseZ;
    data[base + VOXEL_FACE.wallHeight] = faceHeight - wallBaseZ;
    data[base + VOXEL_FACE.wallCapHeight] = faceHeight;
    data[base + VOXEL_FACE.cx] = ecx;
    data[base + VOXEL_FACE.cy] = ecy;
    data[base + VOXEL_FACE.outX] = ecx - cx;
    data[base + VOXEL_FACE.outY] = ecy - cy;
    return true;
}
export function collectVoxelWallFacesInAabbFlat(grid, bounds, list) {
    list.clear();
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (resolveCellWallHeightAtIdx(grid, idx) === 0) return;
        for (let edge = 0; edge < 4; edge++) {
            list.ensureCapacity(list.length + 1);
            if (writeVoxelWallFaceIntoFlat(list.data, list.length, grid, col, row, edge)) list.length++;
        }
    });
}
export function collectRailWallBoxesInAabb(grid, bounds, out) {
    out.clear();
    forEachObstacleGridCellInAabb(grid, bounds, (col, row, idx) => {
        if (!grid.edgeStore.hasAnyAtIdx(idx)) return;
        for (let edge = 0; edge < 4; edge++) {
            out.ensureCapacity(out.length + 1);
            if (writeRailWallBoxRecordInto(out.data, out.length, grid, col, row, edge)) out.length++;
        }
    });
    out.length = mergeCollinearRailWallBoxRecordsInPlace(out);
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
