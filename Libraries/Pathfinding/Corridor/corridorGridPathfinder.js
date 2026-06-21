import { FlatGridSearch, GridPathQuery } from "../AStar.js";
import { SearchState } from "../SearchState.js";
import { FlatGridView } from "../FlatGridView.js";
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
    blockedAtAbs(absCol, absRow) {
        if (!layoutContainsAbsCell(this.layout, absCol, absRow)) return true;
        const local = layoutAbsToLocalCell(this.layout, absCol, absRow);
        if (!this.grid.contains(local.col, local.row)) return true;
        const idx = this.grid.idx(local.col, local.row);
        if (this.roomBlocked[idx]) return true;
        return this.reservedIndices.has(layoutAbsCellIndex(this.layout, absCol, absRow));
    }
    isBlockedGlobal(col, row) {
        return this.blockedAtAbs(col, row);
    }
    isBlocked(col, row) {
        const abs = layoutLocalToAbsCell(this.layout, col, row);
        return this.blockedAtAbs(abs.col, abs.row);
    }
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
        this.grid.blocked = roomBlocked;
    }
    setReservedIndices(indices) {
        this.reservedIndices = indices;
    }
    findQuery(query, maxPathLen = 512) {
        const start = layoutAbsToLocalCell(this.layout, query.start.col, query.start.row);
        const goal = layoutAbsToLocalCell(this.layout, query.target.col, query.target.row);
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
