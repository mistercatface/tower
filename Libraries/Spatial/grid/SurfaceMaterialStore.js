import { cellEdgeSlotOffset } from "./CellEdgeStore.js";
import { cellToChunkCoord, remapChunkCoord } from "./GridCoords.js";
import { edgeMirrorSide, edgeNeighbor } from "./gridCellTopology.js";
import { cellInRect, colRowToIndex } from "./GridUtils.js";
// Surface material ownership resolves from the narrowest owner outward:
// cell/edge override, then chunk profile, then the active/default profile.
export const SURFACE_MATERIAL_OWNER = { Chunk: 0, Cell: 1, Edge: 2, WallFace: 3 };
// Chunk coords are paired into a single numeric Map key (zigzag handles negatives from remap).
const CHUNK_KEY_STRIDE = 0x400000;
function zigzagChunk(n) {
    return n >= 0 ? n * 2 : n * -2 - 1;
}
function unzigzagChunk(u) {
    return u & 1 ? -(u + 1) / 2 : u / 2;
}
function chunkProfileKey(chunkCol, chunkRow) {
    return zigzagChunk(chunkCol) * CHUNK_KEY_STRIDE + zigzagChunk(chunkRow);
}
export class SurfaceMaterialStore {
    constructor() {
        this.cellProfileIds = new Map();
        this.edgeProfileIds = new Map();
        this.chunkProfileIds = new Map();
        this.cols = 0;
        this.rows = 0;
    }
    reset(cols = 0, rows = 0) {
        this.cellProfileIds.clear();
        this.edgeProfileIds.clear();
        this.chunkProfileIds.clear();
        this.cols = cols;
        this.rows = rows;
    }
    snapshot() {
        return { cellProfileIds: new Map(this.cellProfileIds), edgeProfileIds: new Map(this.edgeProfileIds), chunkProfileIds: new Map(this.chunkProfileIds) };
    }
    remap(snapshot, oldCols, oldRows, colOffset, rowOffset, newCols, newRows, cellsPerChunk) {
        this.cols = newCols;
        this.rows = newRows;
        this.cellProfileIds.clear();
        this.edgeProfileIds.clear();
        this.chunkProfileIds.clear();
        for (const [idx, profileId] of snapshot.cellProfileIds) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            this.cellProfileIds.set(nc + nr * newCols, profileId);
        }
        for (const [slot, profileId] of snapshot.edgeProfileIds) {
            const idx = slot >> 2;
            const side = slot & 3;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            const newIdx = nc + nr * newCols;
            this.edgeProfileIds.set((newIdx << 2) + side, profileId);
        }
        if (snapshot.chunkProfileIds.size > 0 && (!cellsPerChunk || cellsPerChunk <= 0)) throw new Error("Surface material chunk remap requires cellsPerChunk");
        for (const [key, profileId] of snapshot.chunkProfileIds) {
            const chunkCol = unzigzagChunk(Math.floor(key / CHUNK_KEY_STRIDE));
            const chunkRow = unzigzagChunk(key % CHUNK_KEY_STRIDE);
            const newChunkCol = remapChunkCoord(chunkCol, colOffset, cellsPerChunk);
            const newChunkRow = remapChunkCoord(chunkRow, rowOffset, cellsPerChunk);
            this.chunkProfileIds.set(chunkProfileKey(newChunkCol, newChunkRow), profileId);
        }
    }
    getChunk(chunkCol, chunkRow) {
        return this.chunkProfileIds.get(chunkProfileKey(chunkCol, chunkRow)) ?? null;
    }
    setChunk(chunkCol, chunkRow, profileId) {
        this.chunkProfileIds.set(chunkProfileKey(chunkCol, chunkRow), profileId);
    }
    clearChunk(chunkCol, chunkRow) {
        this.chunkProfileIds.delete(chunkProfileKey(chunkCol, chunkRow));
    }
    setChunkRange(chunkBounds, profileId) {
        for (let chunkRow = chunkBounds.startRow; chunkRow <= chunkBounds.endRow; chunkRow++)
            for (let chunkCol = chunkBounds.startCol; chunkCol <= chunkBounds.endCol; chunkCol++) this.setChunk(chunkCol, chunkRow, profileId);
    }
    getCellAtIdx(idx) {
        return this.cellProfileIds.get(idx) ?? null;
    }
    setCellAtIdx(idx, profileId) {
        this.cellProfileIds.set(idx, profileId);
    }
    clearCellAtIdx(idx) {
        this.cellProfileIds.delete(idx);
    }
    hasAnyCellAtIdx(idx) {
        return this.cellProfileIds.has(idx);
    }
    getEdge(col, row, side, cols) {
        return this.edgeProfileIds.get(cellEdgeSlotOffset(colRowToIndex(col, row, cols), side)) ?? null;
    }
    getEdgeByIdx(idx, side) {
        return this.edgeProfileIds.get(cellEdgeSlotOffset(idx, side)) ?? null;
    }
    writeEdgeMirrored(col, row, side, cols, rows, profileId) {
        if (!cellInRect(col, row, cols, rows)) return;
        this.clearEdgeMirrored(col, row, side, cols, rows);
        this._setEdgeSlot(col, row, side, cols, profileId);
        const { nc, nr } = edgeNeighbor(col, row, side);
        const nSide = edgeMirrorSide(side);
        if (cellInRect(nc, nr, cols, rows)) this._setEdgeSlot(nc, nr, nSide, cols, profileId);
    }
    clearEdgeMirrored(col, row, side, cols, rows) {
        if (!cellInRect(col, row, cols, rows)) return;
        this._clearEdgeSlot(col, row, side, cols);
        const { nc, nr } = edgeNeighbor(col, row, side);
        const nSide = edgeMirrorSide(side);
        if (cellInRect(nc, nr, cols, rows)) this._clearEdgeSlot(nc, nr, nSide, cols);
    }
    _setEdgeSlot(col, row, side, cols, profileId) {
        this.edgeProfileIds.set(cellEdgeSlotOffset(colRowToIndex(col, row, cols), side), profileId);
    }
    _clearEdgeSlot(col, row, side, cols) {
        this.edgeProfileIds.delete(cellEdgeSlotOffset(colRowToIndex(col, row, cols), side));
    }
    hasAnyEdgeAtIdx(idx) {
        return (
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 0)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 1)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 2)) ||
            this.edgeProfileIds.has(cellEdgeSlotOffset(idx, 3))
        );
    }
}
export function resolveChunkBaseProfileId(grid, col, row, cellsPerChunk, baseProfileId) {
    return resolveChunkSurfaceProfileId(grid, cellToChunkCoord(col, cellsPerChunk), cellToChunkCoord(row, cellsPerChunk), baseProfileId);
}
export function resolveSurfaceProfileId(grid, ownerKind, baseProfileId, cellsPerChunk, a, b = 0, c = 0, face = null) {
    if (ownerKind === SURFACE_MATERIAL_OWNER.Chunk) return grid.surfaceMaterials.getChunk(a, b) ?? baseProfileId;
    if (ownerKind === SURFACE_MATERIAL_OWNER.Cell) {
        const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileId(grid, a % grid.cols, (a / grid.cols) | 0, cellsPerChunk, baseProfileId) : baseProfileId;
        return grid.surfaceMaterials.getCellAtIdx(a) ?? chunkBase;
    }
    if (ownerKind === SURFACE_MATERIAL_OWNER.Edge) {
        const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileId(grid, a, b, cellsPerChunk, baseProfileId) : baseProfileId;
        return grid.surfaceMaterials.getEdge(a, b, c, grid.cols) ?? chunkBase;
    }
    if (ownerKind === SURFACE_MATERIAL_OWNER.WallFace) {
        const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileId(grid, face.gridCol, face.gridRow, cellsPerChunk, baseProfileId) : baseProfileId;
        if (face.isEdgeRail) return grid.surfaceMaterials.getEdge(face.gridCol, face.gridRow, face.gridSide, grid.cols) ?? chunkBase;
        return grid.surfaceMaterials.getCellAtIdx(face.gridIdx) ?? chunkBase;
    }
    throw new Error(`unknown surface material owner kind: ${ownerKind}`);
}
export function resolveCellSurfaceProfileId(grid, idx, baseProfileId, cellsPerChunk = 0) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Cell, baseProfileId, cellsPerChunk, idx);
}
export function resolveEdgeSurfaceProfileId(grid, idx, side, baseProfileId, cellsPerChunk = 0) {
    const chunkBase = cellsPerChunk > 0 ? resolveChunkBaseProfileId(grid, idx % grid.cols, (idx / grid.cols) | 0, cellsPerChunk, baseProfileId) : baseProfileId;
    return grid.surfaceMaterials.getEdgeByIdx(idx, side) ?? chunkBase;
}
export function resolveWallSurfaceProfileId(grid, face, baseProfileId, cellsPerChunk = 0) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.WallFace, baseProfileId, cellsPerChunk, 0, 0, 0, face);
}
export function resolveChunkSurfaceProfileId(grid, chunkCol, chunkRow, baseProfileId) {
    return resolveSurfaceProfileId(grid, SURFACE_MATERIAL_OWNER.Chunk, baseProfileId, 0, chunkCol, chunkRow);
}
