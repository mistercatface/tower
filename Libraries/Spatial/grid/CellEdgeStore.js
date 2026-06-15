import { cellInRect, colRowToIndex } from "./GridUtils.js";
import { forEachObstacleGridCellInAabb } from "./GridCoords.js";
import { edgeNeighbor, edgeMirrorSide, neighborFillLevel } from "./gridCellTopology.js";
import { createRailWallEdge, isBeltRailEdge, isForcefieldEdge, isPortalEdge, isRailWallEdge, railWallHeightPx, PASSAGE_MODE, PORTAL_ACCESS_MODE } from "./CellEdge.js";
const EMPTY = -1;
export class CellEdgeStore {
    constructor() {
        this.slots = new Int32Array(0);
        this.pool = [];
        this.free = [];
        this.passageEdgeCount = 0; /** Mirrored passage edges (forcefield + portal) — one count per pooled edge. */
        this.portalEdgeCount = 0; /** Mirrored portal edges — subset of passage edges. */
    }
    reset(cellCount) {
        this.slots = new Int32Array(cellCount * 4);
        this.slots.fill(EMPTY);
        this.pool.length = 0;
        this.free.length = 0;
        this.passageEdgeCount = 0;
        this.portalEdgeCount = 0;
    }
    /** Full scan — reconciles passage/portal counts after bulk grid rebuilds. */
    recomputePassageEdgeCount() {
        const seen = new Set();
        let passageCount = 0;
        let portalCount = 0;
        for (let i = 0; i < this.slots.length; i++) {
            const ref = this.slots[i];
            if (ref === EMPTY || seen.has(ref)) continue;
            seen.add(ref);
            const edge = this.pool[ref];
            if (isForcefieldEdge(edge)) passageCount++;
            if (isPortalEdge(edge)) portalCount++;
        }
        this.passageEdgeCount = passageCount;
        this.portalEdgeCount = portalCount;
    }
    remapSlots(oldSlots, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
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
            const oldBase = idx * 4;
            const newBase = newIdx * 4;
            for (let side = 0; side < 4; side++) newSlots[newBase + side] = oldSlots[oldBase + side];
        }
        this.slots = newSlots;
    }
    get(col, row, side, cols) {
        const ref = this.slots[colRowToIndex(col, row, cols) * 4 + side];
        if (ref === EMPTY) return null;
        return this.pool[ref];
    }
    has(col, row, side, cols) {
        return this.slots[colRowToIndex(col, row, cols) * 4 + side] !== EMPTY;
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
                if (isPortalEdge(edge)) {
                    pooled.accessMode = edge.accessMode ?? PORTAL_ACCESS_MODE.Both;
                    pooled.partnerKey = edge.partnerKey ?? 0;
                    pooled.linkMode = edge.linkMode ?? "shared";
                    pooled.linkSourceKey = edge.linkSourceKey ?? 0;
                } else {
                    delete pooled.accessMode;
                    delete pooled.partnerKey;
                    delete pooled.linkMode;
                    delete pooled.linkSourceKey;
                }
            } else {
                delete pooled.heightDelta;
                delete pooled.thicknessLevel;
                delete pooled.mode;
                delete pooled.allowedSide;
                delete pooled.powered;
                delete pooled.accessMode;
                delete pooled.partnerKey;
                delete pooled.linkMode;
                delete pooled.linkSourceKey;
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
    _setSlot(col, row, side, cols, ref) {
        this.slots[colRowToIndex(col, row, cols) * 4 + side] = ref;
    }
    writeMirrored(col, row, side, cols, rows, edge) {
        if (!cellInRect(col, row, cols, rows)) return;
        if (!edge) {
            this.clearMirrored(col, row, side, cols, rows);
            return;
        }
        this.clearMirrored(col, row, side, cols, rows);
        const ref = this._alloc(edge);
        this._setSlot(col, row, side, cols, ref);
        const { nc, nr } = edgeNeighbor(col, row, side);
        const nSide = edgeMirrorSide(side);
        if (cellInRect(nc, nr, cols, rows)) this._setSlot(nc, nr, nSide, cols, ref);
        if (isForcefieldEdge(edge)) this.passageEdgeCount++;
        if (isPortalEdge(edge)) this.portalEdgeCount++;
    }
    clearMirrored(col, row, side, cols, rows) {
        if (!cellInRect(col, row, cols, rows)) return;
        const slot = colRowToIndex(col, row, cols) * 4 + side;
        const ref = this.slots[slot];
        if (ref === EMPTY) return;
        if (isForcefieldEdge(this.pool[ref])) this.passageEdgeCount--;
        if (isPortalEdge(this.pool[ref])) this.portalEdgeCount--;
        this.slots[slot] = EMPTY;
        const { nc, nr } = edgeNeighbor(col, row, side);
        const nSide = edgeMirrorSide(side);
        if (cellInRect(nc, nr, cols, rows)) this.slots[colRowToIndex(nc, nr, cols) * 4 + nSide] = EMPTY;
        this._free(ref);
    }
    forEachInAabb(grid, aabb, fn) {
        forEachObstacleGridCellInAabb(grid, aabb, (col, row, idx) => {
            for (let side = 0; side < 4; side++) {
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
            for (let side = 0; side < 4; side++) {
                const ref = this.slots[idx * 4 + side];
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
        const base = idx * 4;
        return this.slots[base] !== EMPTY || this.slots[base + 1] !== EMPTY || this.slots[base + 2] !== EMPTY || this.slots[base + 3] !== EMPTY;
    }
}
export function railWallEdgeFromStamp(capHeightLevel, thicknessLevel, neighborFillLevel) {
    return createRailWallEdge(capHeightLevel - neighborFillLevel, thicknessLevel);
}
