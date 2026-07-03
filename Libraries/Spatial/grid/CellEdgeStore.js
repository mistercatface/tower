import { cellInRect } from "./GridUtils.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { neighborFillLevel, edgeNeighborIdx, edgeMirrorSide } from "./gridCellTopology.js";
export function createRailWallEdge(heightDelta, thicknessLevel) {
    return { heightDelta, thicknessLevel };
}
export function isRailWallEdge(edge) {
    return edge != null;
}
export function railWallCapLevel(edge, neighborFillLevel) {
    return neighborFillLevel + edge.heightDelta;
}
export function railWallHeightPx(edge, cellSize, neighborFillLevel) {
    return railWallCapLevel(edge, neighborFillLevel) * cellSize;
}
export function railWallThicknessPx(edge) {
    return Math.max(1, edge.thicknessLevel);
}
export const CELL_EDGE_SLOT_BYTES = 16;
export function cellEdgeSlotOffset(idx, side) {
    return (idx << 2) + side;
}
const EMPTY = -1;
export class CellEdgeStore {
    constructor() {
        this.slots = new Int32Array(0);
        this.pool = [];
        this.free = [];
        this.cols = 0;
        this.rows = 0;
    }
    reset(cellCount, cols = 0, rows = 0) {
        this.cols = cols;
        this.rows = rows;
        const expCellCount = cols > 0 && rows > 0 ? cols * rows : cellCount;
        this.slots = new Int32Array(expCellCount * 4);
        this.slots.fill(EMPTY);
        this.pool.length = 0;
        this.free.length = 0;
    }
    remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        this.cols = newCols;
        this.rows = newRows;
        const newSlots = new Int32Array(newCols * newRows * 4);
        newSlots.fill(EMPTY);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (!cellInRect(nc, nr, newCols, newRows)) continue;
            const newIdx = nc + nr * newCols;
            for (let side = 0; side < 4; side++) newSlots[(newIdx << 2) + side] = oldSlots[(idx << 2) + side];
        }
        this.slots = newSlots;
    }
    getIdx(idx, side) {
        const ref = this.slots[(idx << 2) + side];
        if (ref === EMPTY) return null;
        return this.pool[ref];
    }
    _alloc(edge) {
        if (this.free.length) {
            const ref = this.free.pop();
            const pooled = this.pool[ref];
            pooled.heightDelta = edge.heightDelta;
            pooled.thicknessLevel = edge.thicknessLevel;
            return ref;
        }
        const ref = this.pool.length;
        this.pool.push(edge);
        return ref;
    }
    _free(ref) {
        this.free.push(ref);
    }
    writeMirrored(idx, side, edge) {
        const cols = this.cols;
        const rows = this.rows;
        if (idx < 0 || idx >= cols * rows) return;
        if (!edge) {
            this.clearMirrored(idx, side);
            return;
        }
        this.clearMirrored(idx, side);
        const ref = this._alloc(edge);
        this.slots[(idx << 2) + side] = ref;
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        if (nIdx !== -1) this.slots[(nIdx << 2) + edgeMirrorSide(side)] = ref;
    }
    clearMirrored(idx, side) {
        const cols = this.cols;
        const rows = this.rows;
        if (idx < 0 || idx >= cols * rows) return;
        const offset = (idx << 2) + side;
        const ref = this.slots[offset];
        if (ref === EMPTY) return;
        this.slots[offset] = EMPTY;
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        if (nIdx !== -1) this.slots[(nIdx << 2) + edgeMirrorSide(side)] = EMPTY;
        this._free(ref);
    }
    forEachInAabb(grid, aabb, fn) {
        forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
            for (let side = 0; side < 4; side++) {
                const edge = this.getIdx(idx, side);
                if (edge) fn(col, row, side, idx, edge);
            }
        });
    }
    collectTopZLevels(grid) {
        const seen = new Set();
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++)
            for (let side = 0; side < 4; side++) {
                const ref = this.slots[(idx << 2) + side];
                if (ref === EMPTY) continue;
                const edge = this.pool[ref];
                seen.add(railWallHeightPx(edge, grid.cellSize, neighborFillLevel(grid, idx, side)));
            }
        const out = [...seen];
        out.sort((a, b) => a - b);
        return out;
    }
    hasAnyAtIdx(idx) {
        const base = idx << 2;
        return this.slots[base] !== EMPTY || this.slots[base + 1] !== EMPTY || this.slots[base + 2] !== EMPTY || this.slots[base + 3] !== EMPTY;
    }
}
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
