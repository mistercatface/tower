import { cellEdgeSlotOffset } from "./cellEdgeSlots.js";
import { edgeMirrorSide, edgeNeighbor } from "./gridCellTopology.js";
import { cellInRect, colRowToIndex } from "./GridUtils.js";
function chunkProfileKey(chunkCol, chunkRow) {
    return `${chunkCol},${chunkRow}`;
}
function parseChunkProfileKey(key) {
    const comma = key.indexOf(",");
    return { chunkCol: Number(key.slice(0, comma)), chunkRow: Number(key.slice(comma + 1)) };
}
export class SurfaceMaterialStore {
    constructor() {
        this.cellProfileIds = new Map();
        this.edgeProfileIds = new Map();
        this.chunkProfileIds = new Map();
    }
    reset() {
        this.cellProfileIds.clear();
        this.edgeProfileIds.clear();
        this.chunkProfileIds.clear();
    }
    snapshot() {
        return { cellProfileIds: new Map(this.cellProfileIds), edgeProfileIds: new Map(this.edgeProfileIds), chunkProfileIds: new Map(this.chunkProfileIds) };
    }
    remap(snapshot, oldCols, oldRows, colOffset, rowOffset, newCols, newRows, cellsPerChunk) {
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
            const idx = (slot / 4) | 0;
            const side = slot - idx * 4;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            const newIdx = nc + nr * newCols;
            this.edgeProfileIds.set(cellEdgeSlotOffset(newIdx, side), profileId);
        }
        if (snapshot.chunkProfileIds.size > 0 && (!cellsPerChunk || cellsPerChunk <= 0)) throw new Error("Surface material chunk remap requires cellsPerChunk");
        for (const [key, profileId] of snapshot.chunkProfileIds) {
            const { chunkCol, chunkRow } = parseChunkProfileKey(key);
            const newChunkCol = Math.floor((chunkCol * cellsPerChunk + colOffset) / cellsPerChunk);
            const newChunkRow = Math.floor((chunkRow * cellsPerChunk + rowOffset) / cellsPerChunk);
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
    setChunkRange(minChunkCol, minChunkRow, maxChunkCol, maxChunkRow, profileId) {
        for (let chunkRow = minChunkRow; chunkRow <= maxChunkRow; chunkRow++) for (let chunkCol = minChunkCol; chunkCol <= maxChunkCol; chunkCol++) this.setChunk(chunkCol, chunkRow, profileId);
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
        const base = idx * 4;
        return this.edgeProfileIds.has(base) || this.edgeProfileIds.has(base + 1) || this.edgeProfileIds.has(base + 2) || this.edgeProfileIds.has(base + 3);
    }
}
export function resolveCellSurfaceProfileId(grid, idx, baseProfileId) {
    return grid.surfaceMaterials.getCellAtIdx(idx) ?? baseProfileId;
}
export function resolveEdgeSurfaceProfileId(grid, col, row, side, baseProfileId) {
    return grid.surfaceMaterials.getEdge(col, row, side, grid.cols) ?? baseProfileId;
}
export function resolveWallSurfaceProfileId(grid, face, baseProfileId) {
    if (face.isEdgeRail) return resolveEdgeSurfaceProfileId(grid, face.gridCol, face.gridRow, face.gridSide, baseProfileId);
    return resolveCellSurfaceProfileId(grid, face.gridIdx, baseProfileId);
}
export function resolveChunkSurfaceProfileId(grid, chunkCol, chunkRow, baseProfileId) {
    return grid.surfaceMaterials.getChunk(chunkCol, chunkRow) ?? baseProfileId;
}
export function resolveChunkBaseProfileId(grid, col, row, cellsPerChunk, baseProfileId) {
    return resolveChunkSurfaceProfileId(grid, Math.floor(col / cellsPerChunk), Math.floor(row / cellsPerChunk), baseProfileId);
}
