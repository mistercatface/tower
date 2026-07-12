import { cellIdxToChunkKey, boundsToCellRectInto, forEachObstacleGridCellInAabbF32, GRID_SIDE_NX, GRID_SIDE_NY } from "../Spatial/spatial.js";
import { railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx, edgeNeighborIdx, cellEdgeEndpointsIdx, edgeRailEmitOwner, railWallEdgeShouldEmit } from "../Spatial/spatial.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/spatial.js";
import { gridSettings } from "../../Config/world.js";
import { StrideFloatList } from "./StrideFloatList.js";
import { ENGINE_F32, ENGINE_BOUNDS_BASE, B_CELL, B_FOOTPRINT, S_EDGE_P1X, S_EDGE_P1Y, S_EDGE_P2X, S_EDGE_P2Y } from "../../Core/engineMemory.js";
import {
    RAIL_BOX_CHUNK_KEY,
    RAIL_BOX_GRID_IDX,
    RAIL_BOX_GRID_SIDE,
    RAIL_BOX_MIN_X,
    RAIL_BOX_MIN_Y,
    RAIL_BOX_MAX_X,
    RAIL_BOX_MAX_Y,
    RAIL_BOX_INNER_P1X,
    RAIL_BOX_INNER_P1Y,
    RAIL_BOX_INNER_P2X,
    RAIL_BOX_INNER_P2Y,
    RAIL_BOX_OUTER_P1X,
    RAIL_BOX_OUTER_P1Y,
    RAIL_BOX_OUTER_P2X,
    RAIL_BOX_OUTER_P2Y,
    RAIL_BOX_INWARD_X,
    RAIL_BOX_INWARD_Y,
    RAIL_BOX_WALL_BASE_Z,
    RAIL_BOX_WALL_HEIGHT,
    RAIL_BOX_WALL_CAP_HEIGHT,
    RAIL_BOX_EDGE_THICKNESS,
    RAIL_BOX_CX,
    RAIL_BOX_CY,
    RAIL_BOX_STRIDE,
    VOXEL_FACE_GRID_IDX,
    VOXEL_FACE_GRID_SIDE,
    VOXEL_FACE_X1,
    VOXEL_FACE_Y1,
    VOXEL_FACE_X2,
    VOXEL_FACE_Y2,
    VOXEL_FACE_WALL_BASE_Z,
    VOXEL_FACE_WALL_HEIGHT,
    VOXEL_FACE_WALL_CAP_HEIGHT,
    VOXEL_FACE_CX,
    VOXEL_FACE_CY,
    VOXEL_FACE_OUT_X,
    VOXEL_FACE_OUT_Y,
    VOXEL_FACE_STRIDE,
} from "./wallGridStride.js";
const CHUNK_CELL_RECT = new Int32Array(4);
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
    const idx = data[base + RAIL_BOX_GRID_IDX];
    const side = data[base + RAIL_BOX_GRID_SIDE];
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
function railWallSideEndpoints(grid, idx, edge, railSide, buf, o1, o2) {
    const halfT = railWallFootprintHalfThickness(grid, idx, edge);
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    const minX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL];
    const minY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1];
    const maxX = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 2];
    const maxY = ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 3];
    if (edge === 0) {
        const y = railSide === 0 ? minY + halfT : minY - halfT;
        buf[o1] = minX;
        buf[o1 + 1] = y;
        buf[o2] = maxX;
        buf[o2 + 1] = y;
    } else if (edge === 2) {
        const y = railSide === 0 ? maxY - halfT : maxY + halfT;
        buf[o1] = maxX;
        buf[o1 + 1] = y;
        buf[o2] = minX;
        buf[o2 + 1] = y;
    } else if (edge === 1) {
        const x = railSide === 0 ? maxX - halfT : maxX + halfT;
        buf[o1] = x;
        buf[o1 + 1] = minY;
        buf[o2] = x;
        buf[o2 + 1] = maxY;
    } else {
        const x = railSide === 0 ? minX + halfT : minX - halfT;
        buf[o1] = x;
        buf[o1 + 1] = maxY;
        buf[o2] = x;
        buf[o2 + 1] = minY;
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
    railWallSideEndpoints(grid, idx, edge, 0, ENGINE_F32, S_EDGE_P1X, S_EDGE_P2X);
    const base = recordIndex * RAIL_BOX_STRIDE;
    data[base + RAIL_BOX_CHUNK_KEY] = cellIdxToChunkKey(idx, grid, gridSettings.minCellsPerChunk);
    data[base + RAIL_BOX_GRID_IDX] = idx;
    data[base + RAIL_BOX_GRID_SIDE] = edge;
    data[base + RAIL_BOX_MIN_X] = minX;
    data[base + RAIL_BOX_MIN_Y] = minY;
    data[base + RAIL_BOX_MAX_X] = maxX;
    data[base + RAIL_BOX_MAX_Y] = maxY;
    data[base + RAIL_BOX_INNER_P1X] = ENGINE_F32[S_EDGE_P1X];
    data[base + RAIL_BOX_INNER_P1Y] = ENGINE_F32[S_EDGE_P1Y];
    data[base + RAIL_BOX_INNER_P2X] = ENGINE_F32[S_EDGE_P2X];
    data[base + RAIL_BOX_INNER_P2Y] = ENGINE_F32[S_EDGE_P2Y];
    railWallSideEndpoints(grid, idx, edge, 1, ENGINE_F32, S_EDGE_P1X, S_EDGE_P2X);
    data[base + RAIL_BOX_OUTER_P1X] = ENGINE_F32[S_EDGE_P1X];
    data[base + RAIL_BOX_OUTER_P1Y] = ENGINE_F32[S_EDGE_P1Y];
    data[base + RAIL_BOX_OUTER_P2X] = ENGINE_F32[S_EDGE_P2X];
    data[base + RAIL_BOX_OUTER_P2Y] = ENGINE_F32[S_EDGE_P2Y];
    data[base + RAIL_BOX_INWARD_X] = -GRID_SIDE_NX[edge];
    data[base + RAIL_BOX_INWARD_Y] = -GRID_SIDE_NY[edge];
    data[base + RAIL_BOX_WALL_BASE_Z] = voxelWallFaceBaseZ(neighborCap, edgeHeight);
    data[base + RAIL_BOX_WALL_HEIGHT] = edgeHeight - data[base + RAIL_BOX_WALL_BASE_Z];
    data[base + RAIL_BOX_WALL_CAP_HEIGHT] = edgeHeight;
    data[base + RAIL_BOX_EDGE_THICKNESS] = railWallThicknessPx(railEdge);
    data[base + RAIL_BOX_CX] = (minX + maxX) * 0.5;
    data[base + RAIL_BOX_CY] = (minY + maxY) * 0.5;
    return true;
}
function clearWallGridDrawableDrawMemos(drawable) {
    delete drawable._faceSubdiv;
    delete drawable._faceSubdivKey;
}
function extendCollinearRailWallBoxRecord(data, curIndex, nextIndex) {
    const cur = curIndex * RAIL_BOX_STRIDE;
    const next = nextIndex * RAIL_BOX_STRIDE;
    data[cur + RAIL_BOX_MIN_X] = Math.min(data[cur + RAIL_BOX_MIN_X], data[next + RAIL_BOX_MIN_X]);
    data[cur + RAIL_BOX_MIN_Y] = Math.min(data[cur + RAIL_BOX_MIN_Y], data[next + RAIL_BOX_MIN_Y]);
    data[cur + RAIL_BOX_MAX_X] = Math.max(data[cur + RAIL_BOX_MAX_X], data[next + RAIL_BOX_MAX_X]);
    data[cur + RAIL_BOX_MAX_Y] = Math.max(data[cur + RAIL_BOX_MAX_Y], data[next + RAIL_BOX_MAX_Y]);
    const edge = data[cur + RAIL_BOX_GRID_SIDE];
    if (edge === 0) {
        data[cur + RAIL_BOX_INNER_P1X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_INNER_P1Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_INNER_P2X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_INNER_P2Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_OUTER_P1X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_OUTER_P1Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_OUTER_P2X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_OUTER_P2Y] = data[cur + RAIL_BOX_MIN_Y];
    } else if (edge === 2) {
        data[cur + RAIL_BOX_INNER_P1X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_INNER_P1Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_INNER_P2X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_INNER_P2Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_OUTER_P1X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_OUTER_P1Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_OUTER_P2X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_OUTER_P2Y] = data[cur + RAIL_BOX_MAX_Y];
    } else if (edge === 1) {
        data[cur + RAIL_BOX_INNER_P1X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_INNER_P1Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_INNER_P2X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_INNER_P2Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_OUTER_P1X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_OUTER_P1Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_OUTER_P2X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_OUTER_P2Y] = data[cur + RAIL_BOX_MAX_Y];
    } else {
        data[cur + RAIL_BOX_INNER_P1X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_INNER_P1Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_INNER_P2X] = data[cur + RAIL_BOX_MAX_X];
        data[cur + RAIL_BOX_INNER_P2Y] = data[cur + RAIL_BOX_MIN_Y];
        data[cur + RAIL_BOX_OUTER_P1X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_OUTER_P1Y] = data[cur + RAIL_BOX_MAX_Y];
        data[cur + RAIL_BOX_OUTER_P2X] = data[cur + RAIL_BOX_MIN_X];
        data[cur + RAIL_BOX_OUTER_P2Y] = data[cur + RAIL_BOX_MIN_Y];
    }
    data[cur + RAIL_BOX_CX] = (data[cur + RAIL_BOX_MIN_X] + data[cur + RAIL_BOX_MAX_X]) * 0.5;
    data[cur + RAIL_BOX_CY] = (data[cur + RAIL_BOX_MIN_Y] + data[cur + RAIL_BOX_MAX_Y]) * 0.5;
}
function collinearRailWallBoxRecordsAdjacent(data, aIndex, bIndex, cols) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX_GRID_SIDE] !== data[b + RAIL_BOX_GRID_SIDE]) return false;
    if (data[a + RAIL_BOX_WALL_CAP_HEIGHT] !== data[b + RAIL_BOX_WALL_CAP_HEIGHT] || data[a + RAIL_BOX_WALL_BASE_Z] !== data[b + RAIL_BOX_WALL_BASE_Z] || data[a + RAIL_BOX_EDGE_THICKNESS] !== data[b + RAIL_BOX_EDGE_THICKNESS]) return false;
    if (data[a + RAIL_BOX_INWARD_X] !== data[b + RAIL_BOX_INWARD_X] || data[a + RAIL_BOX_INWARD_Y] !== data[b + RAIL_BOX_INWARD_Y]) return false;
    const aRow = (data[a + RAIL_BOX_GRID_IDX] / cols) | 0;
    const aCol = data[a + RAIL_BOX_GRID_IDX] - aRow * cols;
    const bRow = (data[b + RAIL_BOX_GRID_IDX] / cols) | 0;
    const bCol = data[b + RAIL_BOX_GRID_IDX] - bRow * cols;
    if (data[a + RAIL_BOX_GRID_SIDE] === 0 || data[a + RAIL_BOX_GRID_SIDE] === 2) {
        if (aRow !== bRow) return false;
        if (data[a + RAIL_BOX_CHUNK_KEY] !== data[b + RAIL_BOX_CHUNK_KEY]) return false;
        return bCol === aCol + 1;
    }
    if (aCol !== bCol) return false;
    if (data[a + RAIL_BOX_CHUNK_KEY] !== data[b + RAIL_BOX_CHUNK_KEY]) return false;
    return bRow === aRow + 1;
}
function compareRailWallBoxRecords(data, aIndex, bIndex, cols) {
    const a = aIndex * RAIL_BOX_STRIDE;
    const b = bIndex * RAIL_BOX_STRIDE;
    if (data[a + RAIL_BOX_GRID_SIDE] !== data[b + RAIL_BOX_GRID_SIDE]) return data[a + RAIL_BOX_GRID_SIDE] - data[b + RAIL_BOX_GRID_SIDE];
    if (data[a + RAIL_BOX_WALL_CAP_HEIGHT] !== data[b + RAIL_BOX_WALL_CAP_HEIGHT]) return data[a + RAIL_BOX_WALL_CAP_HEIGHT] - data[b + RAIL_BOX_WALL_CAP_HEIGHT];
    if (data[a + RAIL_BOX_WALL_BASE_Z] !== data[b + RAIL_BOX_WALL_BASE_Z]) return data[a + RAIL_BOX_WALL_BASE_Z] - data[b + RAIL_BOX_WALL_BASE_Z];
    if (data[a + RAIL_BOX_EDGE_THICKNESS] !== data[b + RAIL_BOX_EDGE_THICKNESS]) return data[a + RAIL_BOX_EDGE_THICKNESS] - data[b + RAIL_BOX_EDGE_THICKNESS];
    const aRow = (data[a + RAIL_BOX_GRID_IDX] / cols) | 0;
    const aCol = data[a + RAIL_BOX_GRID_IDX] - aRow * cols;
    const bRow = (data[b + RAIL_BOX_GRID_IDX] / cols) | 0;
    const bCol = data[b + RAIL_BOX_GRID_IDX] - bRow * cols;
    if (data[a + RAIL_BOX_GRID_SIDE] === 0 || data[a + RAIL_BOX_GRID_SIDE] === 2) {
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
    cellEdgeEndpointsIdx(grid, idx, edge, ENGINE_F32, S_EDGE_P1X, S_EDGE_P2X, 0);
    grid.getCellBoundsByIdxF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_CELL, idx);
    const cx = (ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL] + ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 2]) / 2;
    const cy = (ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 1] + ENGINE_F32[ENGINE_BOUNDS_BASE + B_CELL + 3]) / 2;
    const ecx = (ENGINE_F32[S_EDGE_P1X] + ENGINE_F32[S_EDGE_P2X]) / 2;
    const ecy = (ENGINE_F32[S_EDGE_P1Y] + ENGINE_F32[S_EDGE_P2Y]) / 2;
    const wallBaseZ = voxelWallFaceBaseZ(neighborCap, faceHeight);
    data[base + VOXEL_FACE_GRID_IDX] = idx;
    data[base + VOXEL_FACE_GRID_SIDE] = edge;
    data[base + VOXEL_FACE_X1] = ENGINE_F32[S_EDGE_P1X];
    data[base + VOXEL_FACE_Y1] = ENGINE_F32[S_EDGE_P1Y];
    data[base + VOXEL_FACE_X2] = ENGINE_F32[S_EDGE_P2X];
    data[base + VOXEL_FACE_Y2] = ENGINE_F32[S_EDGE_P2Y];
    data[base + VOXEL_FACE_WALL_BASE_Z] = wallBaseZ;
    data[base + VOXEL_FACE_WALL_HEIGHT] = faceHeight - wallBaseZ;
    data[base + VOXEL_FACE_WALL_CAP_HEIGHT] = faceHeight;
    data[base + VOXEL_FACE_CX] = ecx;
    data[base + VOXEL_FACE_CY] = ecy;
    data[base + VOXEL_FACE_OUT_X] = ecx - cx;
    data[base + VOXEL_FACE_OUT_Y] = ecy - cy;
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
    boundsToCellRectInto(CHUNK_CELL_RECT, 0, buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, CHUNK_CELL_RECT[0]);
    const endCol = Math.min(cols - 1, CHUNK_CELL_RECT[1]);
    const startRow = Math.max(0, CHUNK_CELL_RECT[2]);
    const endRow = Math.min(rows - 1, CHUNK_CELL_RECT[3]);
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
    boundsToCellRectInto(CHUNK_CELL_RECT, 0, buf[o] - obstacleGrid.minX, buf[o + 1] - obstacleGrid.minY, buf[o + 2] - obstacleGrid.minX - 1e-6, buf[o + 3] - obstacleGrid.minY - 1e-6, obstacleGrid.cellSize);
    const cols = obstacleGrid.cols;
    const rows = obstacleGrid.rows;
    const startCol = Math.max(0, CHUNK_CELL_RECT[0]);
    const endCol = Math.min(cols - 1, CHUNK_CELL_RECT[1]);
    const startRow = Math.max(0, CHUNK_CELL_RECT[2]);
    const endRow = Math.min(rows - 1, CHUNK_CELL_RECT[3]);
    for (let r = startRow; r <= endRow; r++) {
        const rowOffset = r * cols;
        for (let c = startCol; c <= endCol; c++) {
            const idx = rowOffset + c;
            for (let side = 0; side < 4; side++) if (railWallAtZLevel(obstacleGrid, idx, side, zLevel)) return true;
        }
    }
    return false;
}
