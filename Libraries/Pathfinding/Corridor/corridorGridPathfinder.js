import { FlatGridSearch, GridPathQuery } from "../AStar.js";
import { SearchState } from "../SearchState.js";
import { FlatGridView } from "../FlatGridView.js";
import { layoutAbsToLocalCell, layoutCellIndex, layoutCellRows, layoutContainsAbsCell, layoutLocalToAbsCell } from "../../Spatial/grid/GridUtils.js";
export class CorridorGridPathfinder {
    constructor(layout) {
        this.layout = layout;
        this.cols = layout.strideCols;
        this.rows = layoutCellRows(layout);
        const size = layout.cellCount;
        this.roomBlocked = new Uint8Array(size);
        this.searchState = new SearchState(size);
        this.reservedIndices = new Set();
        this.grid = new FlatGridView(this.cols, this.rows, {
            blocked: this.roomBlocked,
            canStep: (c0, r0, c1, r1) => {
                if (c0 === c1 && r0 === r1) return false;
                if (c0 !== c1 && r0 !== r1) return false;
                return !this.isBlocked(c1, r1);
            },
        });
        this.gridSearch = new FlatGridSearch({ grid: this.grid, searchState: this.searchState });
    }
    layoutIndex(col, row) {
        return layoutCellIndex(col, row, this.layout.originCol, this.layout.originRow, this.layout.strideCols);
    }
    globalToLocal(col, row) {
        return layoutAbsToLocalCell(this.layout, col, row);
    }
    isBlockedGlobal(col, row) {
        if (!layoutContainsAbsCell(this.layout, col, row)) return true;
        const local = this.globalToLocal(col, row);
        const idx = this.grid.idx(local.col, local.row);
        if (this.roomBlocked[idx]) return true;
        return this.reservedIndices.has(this.layoutIndex(col, row));
    }
    isBlocked(col, row) {
        if (!this.grid.contains(col, row)) return true;
        const idx = this.grid.idx(col, row);
        if (this.roomBlocked[idx]) return true;
        const abs = layoutLocalToAbsCell(this.layout, col, row);
        return this.reservedIndices.has(this.layoutIndex(abs.col, abs.row));
    }
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
        this.grid.blocked = roomBlocked;
    }
    setReservedIndices(indices) {
        this.reservedIndices = indices;
    }
    findQuery(query, maxPathLen = 512) {
        const start = this.globalToLocal(query.start.col, query.start.row);
        const goal = this.globalToLocal(query.target.col, query.target.row);
        if (this.isBlocked(start.col, start.row) || this.isBlocked(goal.col, goal.row)) return null;
        const flat = this.gridSearch.cardinal(new GridPathQuery(start, goal), maxPathLen);
        if (!flat) return null;
        const path = new Array(flat.length);
        for (let i = 0; i < flat.length; i++) {
            const abs = layoutLocalToAbsCell(this.layout, flat[i].col, flat[i].row);
            path[i] = { c: abs.col, r: abs.row };
        }
        return path;
    }
    findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
        return this.findQuery(GridPathQuery.fromCells(startCol, startRow, goalCol, goalRow), maxPathLen);
    }
}
