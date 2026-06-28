import { cellToChunkCoord, forEachObstacleGridCellInAabb } from "../Spatial/grid/GridCoords.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { edgeNeighbor, cellEdgeEndpoints, railWallEdgeShouldEmit, railWallEdgeAt, neighborFillLevel, resolveCellWallHeightAtIdx } from "../Spatial/grid/gridCellTopology.js";
import { railWallCapLevel, railWallHeightPx, railWallThicknessPx } from "../Spatial/grid/CellEdge.js";
import { gridSettings } from "../../Config/world.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
function allocVoxelWallFace() {
    return { gridCol: 0, gridRow: 0, gridIdx: 0, gridSide: 0, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, wallBaseZ: 0, wallHeight: 0, wallCapHeight: 0, cx: 0, cy: 0, outX: 0, outY: 0 };
}
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
function allocRailWallBoxView() {
    return {
        gridCol: 0,
        gridRow: 0,
        chunkCol: 0,
        chunkRow: 0,
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
function fillRailWallBoxViewFromData(view, data, index) {
    const base = index * RAIL_BOX_STRIDE;
    view.gridCol = data[base + RAIL_BOX.gridCol];
    view.gridRow = data[base + RAIL_BOX.gridRow];
    view.chunkCol = data[base + RAIL_BOX.chunkCol];
    view.chunkRow = data[base + RAIL_BOX.chunkRow];
    view.gridIdx = data[base + RAIL_BOX.gridIdx];
    view.gridSide = data[base + RAIL_BOX.gridSide];
    view.minX = data[base + RAIL_BOX.minX];
    view.minY = data[base + RAIL_BOX.minY];
    view.maxX = data[base + RAIL_BOX.maxX];
    view.maxY = data[base + RAIL_BOX.maxY];
    view.innerP1x = data[base + RAIL_BOX.innerP1x];
    view.innerP1y = data[base + RAIL_BOX.innerP1y];
    view.innerP2x = data[base + RAIL_BOX.innerP2x];
    view.innerP2y = data[base + RAIL_BOX.innerP2y];
    view.outerP1x = data[base + RAIL_BOX.outerP1x];
    view.outerP1y = data[base + RAIL_BOX.outerP1y];
    view.outerP2x = data[base + RAIL_BOX.outerP2x];
    view.outerP2y = data[base + RAIL_BOX.outerP2y];
    view.inwardX = data[base + RAIL_BOX.inwardX];
    view.inwardY = data[base + RAIL_BOX.inwardY];
    view.wallBaseZ = data[base + RAIL_BOX.wallBaseZ];
    view.wallHeight = data[base + RAIL_BOX.wallHeight];
    view.wallCapHeight = data[base + RAIL_BOX.wallCapHeight];
    view.edgeThickness = data[base + RAIL_BOX.edgeThickness];
    view.cx = data[base + RAIL_BOX.cx];
    view.cy = data[base + RAIL_BOX.cy];
}
export class RailWallBoxList {
    constructor(initialCapacity = 64) {
        this.data = new Float32Array(initialCapacity * RAIL_BOX_STRIDE);
        this.length = 0;
        this.views = [];
        this.order = [];
        this.scratch = new Float32Array(initialCapacity * RAIL_BOX_STRIDE);
        this.generation = 0;
    }
    clear() {
        this.length = 0;
        this.generation++;
    }
    ensureCapacity(count) {
        const required = count * RAIL_BOX_STRIDE;
        if (this.data.length >= required) return;
        const nextLength = Math.max(this.data.length * 2, required);
        const nextData = new Float32Array(nextLength);
        nextData.set(this.data);
        this.data = nextData;
        this.scratch = new Float32Array(nextLength);
    }
    viewAt(index) {
        let view = this.views[index];
        if (!view) {
            view = allocRailWallBoxView();
            this.views[index] = view;
        }
        if (view._railBoxGeneration !== this.generation || view._railBoxIndex !== index) {
            fillRailWallBoxViewFromData(view, this.data, index);
            clearWallGridDrawableDrawMemos(view);
            view._railBoxGeneration = this.generation;
            view._railBoxIndex = index;
        }
        return view;
    }
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
function writeRailWallBoxRecordInto(data, recordIndex, grid, col, row, edge) {
    if (!railWallEdgeShouldEmit(grid, col, row, edge)) return false;
    const cols = grid.cols;
    const idx = col + row * cols;
    const railEdge = railWallEdgeAt(grid, col, row, edge);
    if (!railEdge) return false;
    const { neighborCap, capHeightPx: edgeHeight } = resolveRailWallNeighborContext(grid, col, row, edge);
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
    const { data, order, scratch } = list;
    for (let i = 0; i < n; i++) order[i] = i;
    order.length = n;
    order.sort((a, b) => compareRailWallBoxRecords(data, a, b));
    for (let i = 0; i < n; i++) copyRailWallBoxRecord(scratch, i, data, order[i]);
    data.set(scratch.subarray(0, n * RAIL_BOX_STRIDE));
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
