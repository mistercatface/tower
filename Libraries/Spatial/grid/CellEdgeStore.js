import { cellInRect, colRowToIndex } from "./GridUtils.js";
import { CELL_EDGE_SIDES, cellEdgeSlotBase, cellEdgeSlotOffset } from "./cellEdgeSlots.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { neighborFillLevel } from "./gridCellTopology.js";
import { createRailWallEdge, isBeltRailEdge, isForcefieldEdge, isRailWallEdge, railWallHeightPx } from "./CellEdge.js";
const EMPTY = -1;
export class CellEdgeStore {
    constructor() {
        this.slots = new Int32Array(0);
        this.pool = [];
        this.free = [];
        this.passageEdgeCount = 0;
    }
    reset(cellCount) {
        this.slots = new Int32Array(cellCount * CELL_EDGE_SIDES);
        this.slots.fill(EMPTY);
        this.pool.length = 0;
        this.free.length = 0;
        this.passageEdgeCount = 0;
    }
    /** Full scan — reconciles passage counts after bulk grid rebuilds. */
    recomputePassageEdgeCount() {
        const seen = new Set();
        let passageCount = 0;
        for (let i = 0; i < this.slots.length; i++) {
            const ref = this.slots[i];
            if (ref === EMPTY || seen.has(ref)) continue;
            seen.add(ref);
            const edge = this.pool[ref];
            if (isForcefieldEdge(edge)) passageCount++;
        }
        this.passageEdgeCount = passageCount;
    }
    remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        const newSlots = new Int32Array(newCols * newRows * CELL_EDGE_SIDES);
        newSlots.fill(EMPTY);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (!cellInRect(nc, nr, newCols, newRows)) continue;
            const newIdx = nc + nr * newCols;
            const oldBase = cellEdgeSlotBase(idx);
            const newBase = cellEdgeSlotBase(newIdx);
            for (let side = 0; side < CELL_EDGE_SIDES; side++) newSlots[newBase + side] = oldSlots[oldBase + side];
        }
        this.slots = newSlots;
    }
    getIdx(idx, side) {
        const ref = this.slots[cellEdgeSlotOffset(idx, side)];
        if (ref === EMPTY) return null;
        return this.pool[ref];
    }
    hasIdx(idx, side) {
        return this.slots[cellEdgeSlotOffset(idx, side)] !== EMPTY;
    }
    get(col, row, side, cols) {
        return this.getIdx(colRowToIndex(col, row, cols), side);
    }
    has(col, row, side, cols) {
        return this.hasIdx(colRowToIndex(col, row, cols), side);
    }
    _alloc(edge) {
        if (this.free.length) {
            const ref = this.free.pop();
            const pooled = this.pool[ref];
            pooled.kind = edge.kind;
            if (isRailWallEdge(edge)) {
                pooled.heightDelta = edge.heightDelta;
                pooled.thicknessLevel = edge.thicknessLevel;
                delete pooled.mode;
                delete pooled.allowedSide;
                delete pooled.powered;
            } else if (isForcefieldEdge(edge)) {
                pooled.mode = edge.mode;
                pooled.allowedSide = edge.allowedSide;
                pooled.powered = edge.powered;
                delete pooled.heightDelta;
                delete pooled.thicknessLevel;
            } else {
                delete pooled.heightDelta;
                delete pooled.thicknessLevel;
                delete pooled.mode;
                delete pooled.allowedSide;
                delete pooled.powered;
            }
            return ref;
        }
        const ref = this.pool.length;
        this.pool.push(edge);
        return ref;
    }
    _free(ref) {
        this.free.push(ref);
    }
    _setSlot(idx, side, ref) {
        this.slots[cellEdgeSlotOffset(idx, side)] = ref;
    }
    writeMirrored(idx, side, cols, rows, edge) {
        if (idx < 0 || idx >= cols * rows) return;
        if (!edge) {
            this.clearMirrored(idx, side, cols, rows);
            return;
        }
        this.clearMirrored(idx, side, cols, rows);
        const ref = this._alloc(edge);
        this._setSlot(idx, side, ref);
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        if (nIdx !== -1) {
            const nSide = (side + 2) % 4;
            this._setSlot(nIdx, nSide, ref);
        }
        if (isForcefieldEdge(edge)) this.passageEdgeCount++;
    }
    clearMirrored(idx, side, cols, rows) {
        if (idx < 0 || idx >= cols * rows) return;
        const slot = cellEdgeSlotOffset(idx, side);
        const ref = this.slots[slot];
        if (ref === EMPTY) return;
        if (isForcefieldEdge(this.pool[ref])) this.passageEdgeCount--;
        this.slots[slot] = EMPTY;
        const nIdx = edgeNeighborIdx(idx, side, cols, rows);
        if (nIdx !== -1) {
            const nSide = (side + 2) % 4;
            this.slots[cellEdgeSlotOffset(nIdx, nSide)] = EMPTY;
        }
        this._free(ref);
    }
    forEachInAabb(grid, aabb, fn) {
        forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
            for (let side = 0; side < CELL_EDGE_SIDES; side++) {
                const edge = this.get(col, row, side, grid.cols);
                if (edge) fn(col, row, side, idx, edge);
            }
        });
    }
    collectTopZLevels(grid) {
        const seen = new Set();
        const cols = grid.cols;
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++)
            for (let side = 0; side < CELL_EDGE_SIDES; side++) {
                const ref = this.slots[cellEdgeSlotOffset(idx, side)];
                if (ref === EMPTY) continue;
                const edge = this.pool[ref];
                if (!isRailWallEdge(edge)) continue;
                const col = idx % cols;
                const row = (idx / cols) | 0;
                seen.add(railWallHeightPx(edge, grid.cellSize, neighborFillLevel(grid, col, row, side)));
            }
        const out = [...seen];
        out.sort((a, b) => a - b);
        return out;
    }
    hasAnyAtIdx(idx) {
        const base = cellEdgeSlotBase(idx);
        return this.slots[base] !== EMPTY || this.slots[base + 1] !== EMPTY || this.slots[base + 2] !== EMPTY || this.slots[base + 3] !== EMPTY;
    }
}
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
function edgeNeighborIdx(idx, side, cols, rows) {
    const col = idx % cols;
    const row = (idx / cols) | 0;
    if (side === 0) return row > 0 ? idx - cols : -1;
    if (side === 1) return col < cols - 1 ? idx + 1 : -1;
    if (side === 2) return row < rows - 1 ? idx + cols : -1;
    if (side === 3) return col > 0 ? idx - 1 : -1;
    return -1;
}
