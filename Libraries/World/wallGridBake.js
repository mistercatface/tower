import { cellIdxToChunkKey, boundsToCellRect, forEachObstacleGridCellInAabbF32, GRID_SIDE_NX, GRID_SIDE_NY } from "../Spatial/spatial.js";
import { railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx, edgeNeighborIdx, cellEdgeEndpointsIdx, edgeRailEmitOwner, railWallEdgeShouldEmit } from "../Spatial/spatial.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/spatial.js";
import { gridSettings } from "../../Config/world.js";
import { StrideFloatList } from "./StrideFloatList.js";
import { ENGINE_F32, ENGINE_BOUNDS_BASE, B_CELL, B_FOOTPRINT } from "../../Core/engineMemory.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
export const RAIL_BOX = { chunkKey: 0, gridIdx: 1, gridSide: 2, minX: 3, minY: 4, maxX: 5, maxY: 6, innerP1x: 7, innerP1y: 8, innerP2x: 9, innerP2y: 10, outerP1x: 11, outerP1y: 12, outerP2x: 13, outerP2y: 14, inwardX: 15, inwardY: 16, wallBaseZ: 17, wallHeight: 18, wallCapHeight: 19, edgeThickness: 20, cx: 21, cy: 22 };
export const RAIL_BOX_STRIDE = 23;
export function voxelWallFaceVisible(neighborCap, faceHeight) {
    if (neighborCap == null) return true;
    return faceHeight > neighborCap;
}
export function voxelWallFaceBaseZ(neighborCap, faceHeight) {
    if (neighborCap == null || faceHeight <= neighborCap) return 0;
    return neighborCap;
}
export function railWallTopZAt(grid, idx, side) {
    const edge = railWallEdgeAt(grid, idx, side);
    if (!edge) return 0;
    return railWallHeightPx(edge, grid, neighborFillLevel(grid, idx, side));
}
export function railWallAtZLevel(grid, idx, side, zLevel) {
    const edge = railWallEdgeAt(grid, idx, side);
    if (!edge) return false;
    return edgeRailEmitOwner(grid, idx, side) && railWallHeightPx(edge, grid, neighborFillLevel(grid, idx, side)) === zLevel;
}
export function railWallFootprintHalfThickness(grid, idx, side) {
    const railEdge = railWallEdgeAt(grid, idx, side);
    if (!railEdge) return 0;
    return railWallThicknessPx(railEdge) / 2;
}
export function resolveRailWallNeighborContext(grid, idx, side) {
    const fillLevel = neighborFillLevel(grid, idx, side);
    const nIdx = edgeNeighborIdx(idx, side, grid);
    let neighborFillHeightPx = 0;
    if (nIdx !== -1) neighborFillHeightPx = resolveCellWallHeightAtIdx(grid, nIdx);
    const neighborCap = neighborFillHeightPx > 0 ? neighborFillHeightPx : null;
    const railEdge = railWallEdgeAt(grid, idx, side);
    const capHeightPx = railEdge ? railWallHeightPx(railEdge, grid, fillLevel) : 0;
    return { neighborFillLevel: fillLevel, neighborFillHeightPx, neighborCap, capHeightPx };
}
export function railWallFootprintAabbF32(buf, o, grid, idx, edge) {
    const halfT = railWallFootprintHalfThickness(grid, idx, edge);
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    const minX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL];
    const minY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1];
    const maxX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 2];
    const maxY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 3];
    if (edge === 0) {
        buf[o] = minX;
        buf[o + 1] = minY - halfT;
        buf[o + 2] = maxX;
        buf[o + 3] = minY + halfT;
    } else if (edge === 1) {
        buf[o] = maxX - halfT;
        buf[o + 1] = minY;
        buf[o + 2] = maxX + halfT;
        buf[o + 3] = maxY;
    } else if (edge === 2) {
        buf[o] = minX;
        buf[o + 1] = maxY - halfT;
        buf[o + 2] = maxX;
        buf[o + 3] = maxY + halfT;
    } else {
        buf[o] = minX - halfT;
        buf[o + 1] = minY;
        buf[o + 2] = minX + halfT;
        buf[o + 3] = maxY;
    }
}
export function flatRailWallCapUvCornersIntoFlat(out8, grid, data, base) {
    const idx = data[base + RAIL_BOX.gridIdx];
    const side = data[base + RAIL_BOX.gridSide];
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    return fillFlatUvFromF32Bounds(out8, ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, side);
}
function fillFlatUvFromF32Bounds(out8, buf, o, side) {
    const minX = buf[o];
    const minY = buf[o + 1];
    const maxX = buf[o + 2];
    const maxY = buf[o + 3];
    if (side === 0) {
        out8[0] = minX;
        out8[1] = minY;
        out8[2] = maxX;
        out8[3] = minY;
        out8[4] = maxX;
        out8[5] = maxY;
        out8[6] = minX;
        out8[7] = maxY;
    } else if (side === 1) {
        out8[0] = maxX;
        out8[1] = minY;
        out8[2] = maxX;
        out8[3] = maxY;
        out8[4] = minX;
        out8[5] = maxY;
        out8[6] = minX;
        out8[7] = minY;
    } else if (side === 2) {
        out8[0] = maxX;
        out8[1] = maxY;
        out8[2] = minX;
        out8[3] = maxY;
        out8[4] = minX;
        out8[5] = minY;
        out8[6] = maxX;
        out8[7] = minY;
    } else {
        out8[0] = minX;
        out8[1] = maxY;
        out8[2] = minX;
        out8[3] = minY;
        out8[4] = maxX;
        out8[5] = minY;
        out8[6] = maxX;
        out8[7] = maxY;
    }
    return out8;
}
function railWallSideEndpoints(grid, idx, edge, railSide, p1, p2) {
    const halfT = railWallFootprintHalfThickness(grid, idx, edge);
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    const minX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL];
    const minY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1];
    const maxX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 2];
    const maxY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 3];
    if (edge === 0) {
        const y = railSide === 0 ? minY + halfT : minY - halfT;
        p1.x = minX;
        p1.y = y;
        p2.x = maxX;
        p2.y = y;
    } else if (edge === 2) {
        const y = railSide === 0 ? maxY - halfT : maxY + halfT;
        p1.x = maxX;
        p1.y = y;
        p2.x = minX;
        p2.y = y;
    } else if (edge === 1) {
        const x = railSide === 0 ? maxX - halfT : maxX + halfT;
        p1.x = x;
        p1.y = minY;
        p2.x = x;
        p2.y = maxY;
    } else {
        const x = railSide === 0 ? minX + halfT : minX - halfT;
        p1.x = x;
        p1.y = maxY;
        p2.x = x;
        p2.y = minY;
    }
}
function writeRailWallBoxRecordInto(data, recordIndex, grid, idx, edge) {
    const cols = grid.cols;
    if (!railWallEdgeShouldEmit(grid, idx, edge)) return false;
    const railEdge = railWallEdgeAt(grid, idx, edge);
    if (!railEdge) return false;
    const { neighborCap, capHeightPx: edgeHeight } = resolveRailWallNeighborContext(grid, idx, edge);
    if (edgeHeight <= 0) return false;
    if (!voxelWallFaceVisible(neighborCap, edgeHeight)) return false;
    railWallFootprintAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_FOOTPRINT, grid, idx, edge);
    const minX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_FOOTPRINT];
    const minY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_FOOTPRINT + 1];
    const maxX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_FOOTPRINT + 2];
    const maxY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_FOOTPRINT + 3];
    railWallSideEndpoints(grid, idx, edge, 0, sP1, sP2);
    const base = recordIndex * RAIL_BOX_STRIDE;
    data[base + RAIL_BOX.chunkKey] = cellIdxToChunkKey(idx, grid, gridSettings.minCellsPerChunk);
    data[base + RAIL_BOX.gridIdx] = idx;
    data[base + RAIL_BOX.gridSide] = edge;
    data[base + RAIL_BOX.minX] = minX;
    data[base + RAIL_BOX.minY] = minY;
    data[base + RAIL_BOX.maxX] = maxX;
    data[base + RAIL_BOX.maxY] = maxY;
    data[base + RAIL_BOX.innerP1x] = sP1.x;
    data[base + RAIL_BOX.innerP1y] = sP1.y;
    data[base + RAIL_BOX.innerP2x] = sP2.x;
    data[base + RAIL_BOX.innerP2y] = sP2.y;
    railWallSideEndpoints(grid, idx, edge, 1, sP1, sP2);
    data[base + RAIL_BOX.outerP1x] = sP1.x;
    data[base + RAIL_BOX.outerP1y] = sP1.y;
    data[base + RAIL_BOX.outerP2x] = sP2.x;
    data[base + RAIL_BOX.outerP2y] = sP2.y;
    data[base + RAIL_BOX.inwardX] = -GRID_SIDE_NX[edge];
    data[base + RAIL_BOX.inwardY] = -GRID_SIDE_NY[edge];
    data[base + RAIL_BOX.wallBaseZ] = voxelWallFaceBaseZ(neighborCap, edgeHeight);
    data[base + RAIL_BOX.wallHeight] = edgeHeight - data[base + RAIL_BOX.wallBaseZ];
    data[base + RAIL_BOX.wallCapHeight] = edgeHeight;
    data[base + RAIL_BOX.edgeThickness] = railWallThicknessPx(railEdge);
    data[base + RAIL_BOX.cx] = (minX + maxX) * 0.5;
    data[base + RAIL_BOX.cy] = (minY + maxY) * 0.5;
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
function collinearRailWallBoxRecordsAdjacent(data, aIndex, bIndex, cols) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX.gridSide] !== data[b + RAIL_BOX.gridSide]) return false;
    if (data[a + RAIL_BOX.wallCapHeight] !== data[b + RAIL_BOX.wallCapHeight] || data[a + RAIL_BOX.wallBaseZ] !== data[b + RAIL_BOX.wallBaseZ] || data[a + RAIL_BOX.edgeThickness] !== data[b + RAIL_BOX.edgeThickness]) return false;
    if (data[a + RAIL_BOX.inwardX] !== data[b + RAIL_BOX.inwardX] || data[a + RAIL_BOX.inwardY] !== data[b + RAIL_BOX.inwardY]) return false;
    const aRow = (data[a + RAIL_BOX.gridIdx] / cols) | 0;
    const aCol = data[a + RAIL_BOX.gridIdx] - aRow * cols;
    const bRow = (data[b + RAIL_BOX.gridIdx] / cols) | 0;
    const bCol = data[b + RAIL_BOX.gridIdx] - bRow * cols;
    if (data[a + RAIL_BOX.gridSide] === 0 || data[a + RAIL_BOX.gridSide] === 2) {
        if (aRow !== bRow) return false;
        if (data[a + RAIL_BOX.chunkKey] !== data[b + RAIL_BOX.chunkKey]) return false;
        return bCol === aCol + 1;
    }
    if (aCol !== bCol) return false;
    if (data[a + RAIL_BOX.chunkKey] !== data[b + RAIL_BOX.chunkKey]) return false;
    return bRow === aRow + 1;
}
function compareRailWallBoxRecords(data, aIndex, bIndex, cols) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX.gridSide] !== data[b + RAIL_BOX.gridSide]) return data[a + RAIL_BOX.gridSide] - data[b + RAIL_BOX.gridSide];
    if (data[a + RAIL_BOX.wallCapHeight] !== data[b + RAIL_BOX.wallCapHeight]) return data[a + RAIL_BOX.wallCapHeight] - data[b + RAIL_BOX.wallCapHeight];
    if (data[a + RAIL_BOX.wallBaseZ] !== data[b + RAIL_BOX.wallBaseZ]) return data[a + RAIL_BOX.wallBaseZ] - data[b + RAIL_BOX.wallBaseZ];
    if (data[a + RAIL_BOX.edgeThickness] !== data[b + RAIL_BOX.edgeThickness]) return data[a + RAIL_BOX.edgeThickness] - data[b + RAIL_BOX.edgeThickness];
    const aRow = (data[a + RAIL_BOX.gridIdx] / cols) | 0;
    const aCol = data[a + RAIL_BOX.gridIdx] - aRow * cols;
    const bRow = (data[b + RAIL_BOX.gridIdx] / cols) | 0;
    const bCol = data[b + RAIL_BOX.gridIdx] - bRow * cols;
    if (data[a + RAIL_BOX.gridSide] === 0 || data[a + RAIL_BOX.gridSide] === 2) {
        if (aRow !== bRow) return aRow - bRow;
        return aCol - bCol;
    }
    if (aCol !== bCol) return aCol - bCol;
    return aRow - bRow;
}
function copyRailWallBoxRecord(data, dstIndex, src, srcIndex) {
    const dst = dstIndex * RAIL_BOX_STRIDE;
    const start = srcIndex * RAIL_BOX_STRIDE;
    for (let i = 0; i < RAIL_BOX_STRIDE; i++) data[dst + i] = src[start + i];
}
function mergeCollinearRailWallBoxRecordsInPlace(list, cols) {
    const n = list.length;
    if (n <= 1) return n;
    const { data } = list;
    const order = new Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => compareRailWallBoxRecords(data, a, b, cols));
    const scratch = new Float32Array(n * RAIL_BOX_STRIDE);
    for (let i = 0; i < n; i++) copyRailWallBoxRecord(scratch, i, data, order[i]);
    data.set(scratch);
    let write = 1;
    let cur = 0;
    for (let i = 1; i < n; i++)
        if (collinearRailWallBoxRecordsAdjacent(data, cur, i, cols)) extendCollinearRailWallBoxRecord(data, cur, i);
        else {
            cur = write;
            if (cur !== i) copyRailWallBoxRecord(data, cur, data, i);
            write++;
        }
    return write;
}
export const VOXEL_FACE = { gridIdx: 0, gridSide: 1, x1: 2, y1: 3, x2: 4, y2: 5, wallBaseZ: 6, wallHeight: 7, wallCapHeight: 8, cx: 9, cy: 10, outX: 11, outY: 12 };
export const VOXEL_FACE_STRIDE = 13;
export function writeVoxelWallFaceIntoFlat(data, baseIndex, grid, idx, edge) {
    const base = baseIndex * VOXEL_FACE_STRIDE;
    const cols = grid.cols;
    const fillHeight = resolveCellWallHeightAtIdx(grid, idx);
    const storedEdge = railWallEdgeAt(grid, idx, edge);
    const edgeLevel = storedEdge ? railWallCapLevel(storedEdge, neighborFillLevel(grid, idx, edge)) : 0;
    if (edgeLevel > 0) return false;
    if (fillHeight === 0) return false;
    const faceHeight = fillHeight;
    const nIdx = edgeNeighborIdx(idx, edge, grid);
    let neighborFillHeight = 0;
    if (nIdx !== -1) neighborFillHeight = resolveCellWallHeightAtIdx(grid, nIdx);
    const neighborCap = neighborFillHeight > 0 ? neighborFillHeight : null;
    if (!voxelWallFaceVisible(neighborCap, faceHeight)) return false;
    const col = idx % cols;
    const row = (idx / cols) | 0;
    cellEdgeEndpointsIdx(grid, idx, edge, sP1, sP2, 0);
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    const cx = (ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL] + ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 2]) / 2;
    const cy = (ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1] + ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 3]) / 2;
    const ecx = (sP1.x + sP2.x) / 2;
    const ecy = (sP1.y + sP2.y) / 2;
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, faceHeight);
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
export function collectVoxelWallFacesInAabbFlatF32(grid, buf, o, list) {
    list.clear();
    forEachObstacleGridCellInAabbF32(grid, buf, o, (idx) => {
        if (resolveCellWallHeightAtIdx(grid, idx) === 0) return;
        for (let edge = 0; edge < 4; edge++) {
            list.ensureCapacity(list.length + 1);
            if (writeVoxelWallFaceIntoFlat(list.data, list.length, grid, idx, edge)) list.length++;
        }
    });
}
export function collectRailWallBoxesInAabbF32(grid, buf, o, out) {
    out.clear();
    forEachObstacleGridCellInAabbF32(grid, buf, o, (idx) => {
        if (!grid.hasAnyCellEdgeAtIdx(idx)) return;
        for (let edge = 0; edge < 4; edge++) {
            out.ensureCapacity(out.length + 1);
            if (writeRailWallBoxRecordInto(out.data, out.length, grid, idx, edge)) out.length++;
        }
    });
    out.length = mergeCollinearRailWallBoxRecordsInPlace(out, grid.cols);
}
export function defaultWallCapPx(settings) {
    return settings.wallHeightCells * settings.cellSize;
}
export function resolveWallCapHeightPx(capHeight, settings) {
    return capHeight ?? defaultWallCapPx(settings);
}
export function chunkHasStaticRoofAtLevel(obstacleGrid, buf, o, zLevel) {
    const rect = boundsToCellRect(buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, rect.minCol);
    const endCol = Math.min(cols - 1, rect.maxCol);
    const startRow = Math.max(0, rect.minRow);
    const endRow = Math.min(rows - 1, rect.maxRow);
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) if (resolveCellWallHeightAtIdx(obstacleGrid, rowOffset + c) === zLevel) return true;
    }
    return false;
}
export function chunkHasStaticStructureAtLevel(obstacleGrid, buf, o, zLevel) {
    return chunkHasStaticRoofAtLevel(obstacleGrid, buf, o, zLevel) || chunkHasStaticEdgeRailsAtLevel(obstacleGrid, buf, o, zLevel);
}
export function chunkHasStaticEdgeRailsAtLevel(obstacleGrid, buf, o, zLevel) {
    const rect = boundsToCellRect(buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, rect.minCol);
    const endCol = Math.min(cols - 1, rect.maxCol);
    const startRow = Math.max(0, rect.minRow);
    const endRow = Math.min(rows - 1, rect.maxRow);
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) {
            const idx = rowOffset + c;
            for (let side = 0; side < 4; side++) if (railWallAtZLevel(obstacleGrid, idx, side, zLevel)) return true;
        }
    }
    return false;
}
