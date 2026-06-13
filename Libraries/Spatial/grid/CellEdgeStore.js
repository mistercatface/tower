import { colRowToIndex } from "./GridUtils.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { gridWallEdgeNeighbor, gridWallEdgeMirrorSide, gridNeighborFillLevel } from "../../World/wallGridCells.js";
import { createRailWallEdge, EDGE_KIND, isBeltRailEdge, isRailWallEdge, railWallHeightPx } from "./CellEdge.js";
const EMPTY = -1;
export class CellEdgeStore {
    constructor() {
        /** @type {Int32Array} */
        this.slots = new Int32Array(0);
        /** @type {object[]} */
        this.pool = [];
        /** @type {number[]} */
        this.free = [];
    }
    /** @param {number} cellCount */
    reset(cellCount) {
        this.slots = new Int32Array(cellCount * 4);
        this.slots.fill(EMPTY);
        this.pool.length = 0;
        this.free.length = 0;
    }
    /**
     * @param {Int32Array} oldSlots
     * @param {number} oldCols
     * @param {number} oldRows
     * @param {number} colOffset
     * @param {number} rowOffset
     * @param {number} newCols
     * @param {number} newRows
     */
    remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        const newSlots = new Int32Array(newCols * newRows * 4);
        newSlots.fill(EMPTY);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            const newIdx = nc + nr * newCols;
            const oldBase = idx * 4;
            const newBase = newIdx * 4;
            for (let side = 0; side < 4; side++) newSlots[newBase + side] = oldSlots[oldBase + side];
        }
        this.slots = newSlots;
    }
    /** @param {number} col @param {number} row @param {number} side @param {number} cols */
    get(col, row, side, cols) {
        const ref = this.slots[colRowToIndex(col, row, cols) * 4 + side];
        if (ref === EMPTY) return null;
        return this.pool[ref];
    }
    /** @param {number} col @param {number} row @param {number} side @param {number} cols */
    has(col, row, side, cols) {
        return this.slots[colRowToIndex(col, row, cols) * 4 + side] !== EMPTY;
    }
    /** @param {object} edge */
    _alloc(edge) {
        if (this.free.length) {
            const ref = this.free.pop();
            const pooled = this.pool[ref];
            pooled.kind = edge.kind;
            if (isRailWallEdge(edge)) {
                pooled.heightDelta = edge.heightDelta;
                pooled.thicknessLevel = edge.thicknessLevel;
            } else {
                delete pooled.heightDelta;
                delete pooled.thicknessLevel;
            }
            return ref;
        }
        const ref = this.pool.length;
        this.pool.push(edge);
        return ref;
    }
    /** @param {number} ref */
    _free(ref) {
        this.free.push(ref);
    }
    /** @param {number} cols @param {number} col @param {number} row @param {number} side @param {number} ref */
    _setSlot(col, row, side, cols, ref) {
        this.slots[colRowToIndex(col, row, cols) * 4 + side] = ref;
    }
    /**
     * @param {number} col
     * @param {number} row
     * @param {number} side
     * @param {number} cols
     * @param {number} rows
     * @param {object | null} edge
     */
    writeMirrored(col, row, side, cols, rows, edge) {
        if (col < 0 || col >= cols || row < 0 || row >= rows) return;
        if (!edge) {
            this.clearMirrored(col, row, side, cols, rows);
            return;
        }
        this.clearMirrored(col, row, side, cols, rows);
        const ref = this._alloc(edge);
        this._setSlot(col, row, side, cols, ref);
        const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
        const nSide = gridWallEdgeMirrorSide(side);
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) this._setSlot(nc, nr, nSide, cols, ref);
    }
    /**
     * @param {number} col
     * @param {number} row
     * @param {number} side
     * @param {number} cols
     * @param {number} rows
     */
    clearMirrored(col, row, side, cols, rows) {
        if (col < 0 || col >= cols || row < 0 || row >= rows) return;
        const slot = colRowToIndex(col, row, cols) * 4 + side;
        const ref = this.slots[slot];
        if (ref === EMPTY) return;
        this.slots[slot] = EMPTY;
        const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
        const nSide = gridWallEdgeMirrorSide(side);
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) this.slots[colRowToIndex(nc, nr, cols) * 4 + nSide] = EMPTY;
        this._free(ref);
    }
    /** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {import("../../Math/Aabb2D.js").Aabb2D} aabb @param {(col: number, row: number, side: number, idx: number, edge: object) => void} fn */
    forEachInAabb(grid, aabb, fn) {
        forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
            for (let side = 0; side < 4; side++) {
                const edge = this.get(col, row, side, grid.cols);
                if (edge) fn(col, row, side, idx, edge);
            }
        });
    }
    /** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @returns {number[]} */
    collectTopZLevels(grid) {
        const seen = new Set();
        const cols = grid.cols;
        const size = grid.cols * grid.rows;
        for (let idx = 0; idx < size; idx++)
            for (let side = 0; side < 4; side++) {
                const ref = this.slots[idx * 4 + side];
                if (ref === EMPTY) continue;
                const edge = this.pool[ref];
                if (!isRailWallEdge(edge)) continue;
                const col = idx % cols;
                const row = (idx / cols) | 0;
                seen.add(railWallHeightPx(edge, grid.cellSize, gridNeighborFillLevel(grid, col, row, side)));
            }
        const out = [...seen];
        out.sort((a, b) => a - b);
        return out;
    }
    /** @param {number} idx */
    hasAnyAtIdx(idx) {
        const base = idx * 4;
        return this.slots[base] !== EMPTY || this.slots[base + 1] !== EMPTY || this.slots[base + 2] !== EMPTY || this.slots[base + 3] !== EMPTY;
    }
}
/** @param {number} capHeightLevel absolute cap level @param {number} thicknessLevel @param {number} neighborFillLevel */
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
