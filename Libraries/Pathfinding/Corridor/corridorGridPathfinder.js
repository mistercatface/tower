import { FlatGridSearch, GridPathQuery } from "../AStar.js";
import { SearchState } from "../SearchState.js";
import { createCellIndexLayout, layoutAbsToLocalCell, layoutCellIndex, layoutCellRows, layoutContainsAbsCell, layoutLocalToAbsCell } from "../../Spatial/grid/GridUtils.js";
export class CorridorGridPathfinder {
    constructor(layout) {
        this.layout = layout;
        this.cols = layout.strideCols;
        this.rows = layoutCellRows(layout);
        this.originCol = layout.originCol;
        this.originRow = layout.originRow;
        const size = layout.cellCount;
        this.roomBlocked = new Uint8Array(size);
        this.searchState = new SearchState(size);
        this.reservedIndices = new Set();
        this.navGraph = {
            cols: this.cols,
            rows: this.rows,
            cellSize: 1,
            minX: 0,
            minY: 0,
            grid: this.roomBlocked,
            worldToGrid: (x, y) => ({ col: x, row: y }),
            gridToWorld: (col, row) => ({ x: col, y: row }),
            isBlocked: (col, row) => this.isBlocked(col, row),
            canStep: (c0, r0, c1, r1) => {
                if (c0 === c1 && r0 === r1) return false;
                if (c0 !== c1 && r0 !== r1) return false;
                return !this.isBlocked(c1, r1);
            },
        };
        this.gridSearch = new FlatGridSearch({ navGraph: this.navGraph, cols: this.cols, rows: this.rows, searchState: this.searchState });
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
        const idx = local.row * this.cols + local.col;
        if (this.roomBlocked[idx]) return true;
        return this.reservedIndices.has(this.layoutIndex(col, row));
    }
    isBlocked(col, row) {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
        const idx = row * this.cols + col;
        if (this.roomBlocked[idx]) return true;
        const abs = layoutLocalToAbsCell(this.layout, col, row);
        return this.reservedIndices.has(this.layoutIndex(abs.col, abs.row));
    }
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
        this.navGraph.grid = roomBlocked;
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
export function createCorridorGridPathfinder(bounds) {
    return new CorridorGridPathfinder(createCellIndexLayout(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows));
}
