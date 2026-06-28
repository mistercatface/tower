import { cellInRect } from "./GridUtils.js";
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
        this.cols = 0;
        this.rows = 0;
    }
    reset(cellCount, cols = 0, rows = 0) {
        this.cols = cols;
        this.rows = rows;
        const expCellCount = cols > 0 && rows > 0 ? (cols + 1) * (rows + 1) : cellCount;
        this.slots = new Int32Array(expCellCount * CELL_EDGE_SIDES);
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
        this.cols = newCols;
        this.rows = newRows;
        const newSlots = new Int32Array((newCols + 1) * (newRows + 1) * CELL_EDGE_SIDES);
        newSlots.fill(EMPTY);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (!cellInRect(nc, nr, newCols, newRows)) continue;
            const newIdx = nc + nr * newCols;
            for (let side = 0; side < 4; side++) {
                const oldOffset = cellEdgeSlotOffset(idx, side, oldCols);
                const newOffset = cellEdgeSlotOffset(newIdx, side, newCols);
                newSlots[newOffset] = oldSlots[oldOffset];
            }
        }
        this.slots = newSlots;
    }
    getIdx(idx, side) {
        const offset = cellEdgeSlotOffset(idx, side, this.cols);
        const ref = this.slots[offset];
        if (ref === EMPTY) return null;
        return this.pool[ref];
    }
    hasIdx(idx, side) {
        return this.slots[cellEdgeSlotOffset(idx, side, this.cols)] !== EMPTY;
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
    writeMirrored(idx, side, cols, rows, edge) {
        if (idx < 0 || idx >= cols * rows) return;
        if (!edge) {
            this.clearMirrored(idx, side, cols, rows);
            return;
        }
        this.clearMirrored(idx, side, cols, rows);
        const ref = this._alloc(edge);
        const offset = cellEdgeSlotOffset(idx, side, cols);
        this.slots[offset] = ref;
        if (isForcefieldEdge(edge)) this.passageEdgeCount++;
    }
    clearMirrored(idx, side, cols, rows) {
        if (idx < 0 || idx >= cols * rows) return;
        const offset = cellEdgeSlotOffset(idx, side, cols);
        const ref = this.slots[offset];
        if (ref === EMPTY) return;
        if (isForcefieldEdge(this.pool[ref])) this.passageEdgeCount--;
        this.slots[offset] = EMPTY;
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
        const cols = grid.cols;
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++)
            for (let side = 0; side < 4; side++) {
                const ref = this.slots[cellEdgeSlotOffset(idx, side, cols)];
                if (ref === EMPTY) continue;
                const edge = this.pool[ref];
                if (!isRailWallEdge(edge)) continue;
                seen.add(railWallHeightPx(edge, grid.cellSize, neighborFillLevel(grid, idx, side)));
            }
        const out = [...seen];
        out.sort((a, b) => a - b);
        return out;
    }
    hasAnyAtIdx(idx) {
        const cols = this.cols;
        return (
            this.slots[cellEdgeSlotOffset(idx, 0, cols)] !== EMPTY ||
            this.slots[cellEdgeSlotOffset(idx, 1, cols)] !== EMPTY ||
            this.slots[cellEdgeSlotOffset(idx, 2, cols)] !== EMPTY ||
            this.slots[cellEdgeSlotOffset(idx, 3, cols)] !== EMPTY
        );
    }
}
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
