import { FlatGridSearch, SearchState, FlatGridView } from "../AStar.js";
import { layoutAbsCellIndex, layoutAbsToLocalCell, layoutCellRows, layoutContainsAbsCell, layoutLocalToAbsCell } from "../../Spatial/grid/GridUtils.js";
export class CorridorGridPathfinder {
    constructor(layout) {
        this.layout = layout;
        this.cols = layout.strideCols;
        this.rows = layoutCellRows(layout);
        const size = layout.cellCount;
        this.roomBlocked = new Uint8Array(size);
        this.searchState = new SearchState(size);
        this.reservedIndices = new Set();
        this.grid = new FlatGridView(this.cols, this.rows, { blocked: this.roomBlocked, canStep: (idx0, idx1) => !this.isBlockedIdx(idx1) });
        this.gridSearch = new FlatGridSearch(this.searchState);
        this.gridSearch.grid = this.grid;
        this.gridSearch.gridIdx = this.grid.gridIdx;
        this.pathScratch = new Int32Array(512);
    }
    blockedAtAbs(absCol, absRow) {
        if (!layoutContainsAbsCell(this.layout, absCol, absRow)) return true;
        const local = layoutAbsToLocalCell(this.layout, absCol, absRow);
        if (!this.grid.contains(local.col, local.row)) return true;
        const idx = this.grid.idx(local.col, local.row);
        return this.roomBlocked[idx] || this.reservedIndices.has(idx);
    }
    isBlockedGlobal(col, row) {
        return this.blockedAtAbs(col, row);
    }
    isBlocked(col, row) {
        const abs = layoutLocalToAbsCell(this.layout, col, row);
        return this.blockedAtAbs(abs.col, abs.row);
    }
    isBlockedIdx(idx) {
        if (idx < 0 || idx >= this.layout.cellCount) return true;
        return this.roomBlocked[idx] || this.reservedIndices.has(idx);
    }
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
        this.grid.blocked = roomBlocked;
    }
    setReservedIndices(indices) {
        this.reservedIndices = indices;
    }
    findQuery(startIdx, goalIdx, maxPathLen = 512) {
        if (this.isBlockedIdx(startIdx) || this.isBlockedIdx(goalIdx)) return null;
        if (this.pathScratch.length < maxPathLen) this.pathScratch = new Int32Array(maxPathLen);
        const len = this.gridSearch.cardinal(startIdx, goalIdx, maxPathLen, this.pathScratch);
        if (len === 0) return null;
        return this.pathScratch.slice(0, len);
    }
    findPath(startIdx, goalIdx, maxPathLen = 512) {
        return this.findQuery(startIdx, goalIdx, maxPathLen);
    }
}
