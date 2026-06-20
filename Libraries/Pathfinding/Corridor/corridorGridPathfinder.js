import { runCardinalAStarFlat } from "../AStar.js";
import { SearchState } from "../SearchState.js";
/**
 * Reusable grid A* for corridor mid-routing. Room interiors live in `roomBlocked`;
 * reserved corridor footprints live in `reservedKeys` ("col,row").
 */
export class CorridorGridPathfinder {
    /** @param {number} cols @param {number} rows @param {number} [originCol] @param {number} [originRow] */
    constructor(cols, rows, originCol = 0, originRow = 0) {
        this.cols = cols;
        this.rows = rows;
        this.originCol = originCol;
        this.originRow = originRow;
        const size = cols * rows;
        this.roomBlocked = new Uint8Array(size);
        this.searchState = new SearchState(size);
        /** @type {Set<string>} */
        this.reservedKeys = new Set();
    }
    /** @param {number} col @param {number} row */
    globalToLocal(col, row) {
        return { col: col - this.originCol, row: row - this.originRow };
    }
    /** @param {number} col @param {number} row */
    isBlockedGlobal(col, row) {
        const localCol = col - this.originCol;
        const localRow = row - this.originRow;
        if (localCol < 0 || localRow < 0 || localCol >= this.cols || localRow >= this.rows) return true;
        const idx = localRow * this.cols + localCol;
        if (this.roomBlocked[idx]) return true;
        return this.reservedKeys.has(`${col},${row}`);
    }
    /** @param {number} col @param {number} row */
    isBlocked(col, row) {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
        const idx = row * this.cols + col;
        if (this.roomBlocked[idx]) return true;
        return this.reservedKeys.has(`${col + this.originCol},${row + this.originRow}`);
    }
    /** @param {Uint8Array} roomBlocked */
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
    }
    /** @param {Set<string>} keys */
    setReservedKeys(keys) {
        this.reservedKeys = keys;
    }
    /** @param {number} startCol @param {number} startRow @param {number} goalCol @param {number} goalRow @param {number} [maxPathLen] */
    findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
        const start = this.globalToLocal(startCol, startRow);
        const goal = this.globalToLocal(goalCol, goalRow);
        if (this.isBlocked(start.col, start.row) || this.isBlocked(goal.col, goal.row)) return null;
        const { cols, rows, originCol, originRow } = this;
        const navGraph = {
            cols,
            rows,
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
        const flat = runCardinalAStarFlat(start.col, start.row, goal.col, goal.row, navGraph, cols, rows, maxPathLen, this.searchState.prepare());
        if (!flat) return null;
        /** @type {{ c: number, r: number }[]} */
        const path = new Array(flat.length);
        for (let i = 0; i < flat.length; i++) path[i] = { c: flat[i].col + originCol, r: flat[i].row + originRow };
        return path;
    }
}
/** @param {import("./corridorWalkGrid.js").CorridorSearchBounds} bounds */
export function createCorridorGridPathfinder(bounds) {
    return new CorridorGridPathfinder(bounds.cols, bounds.rows, bounds.originCol, bounds.originRow);
}
