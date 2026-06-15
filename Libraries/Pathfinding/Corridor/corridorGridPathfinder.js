import { runCardinalAStarFlat } from "../AStar.js";

/**
 * Reusable grid A* for corridor mid-routing. Room interiors live in `roomBlocked`;
 * reserved corridor footprints live in `reservedKeys` ("col,row").
 */
export class CorridorGridPathfinder {
    /** @param {number} cols @param {number} rows */
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows;
        const size = cols * rows;
        this.roomBlocked = new Uint8Array(size);
        this.gScore = new Float32Array(size);
        this.cameFrom = new Int32Array(size);
        this.visited = new Int32Array(size);
        this.runId = 0;
        /** @type {Set<string>} */
        this.reservedKeys = new Set();
    }

    /** @param {Uint8Array} roomBlocked */
    setRoomBlocked(roomBlocked) {
        this.roomBlocked = roomBlocked;
    }

    /** @param {Set<string>} keys */
    setReservedKeys(keys) {
        this.reservedKeys = keys;
    }

    /** @param {number} col @param {number} row */
    isBlocked(col, row) {
        if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
        const idx = row * this.cols + col;
        if (this.roomBlocked[idx]) return true;
        return this.reservedKeys.has(`${col},${row}`);
    }

    /** @param {number} startCol @param {number} startRow @param {number} goalCol @param {number} goalRow @param {number} [maxPathLen] */
    findPath(startCol, startRow, goalCol, goalRow, maxPathLen = 512) {
        const { cols, rows } = this;
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
        this.runId++;
        const flat = runCardinalAStarFlat(startCol, startRow, goalCol, goalRow, navGraph, cols, rows, maxPathLen, this.gScore, this.cameFrom, this.visited, this.runId);
        if (!flat) return null;
        /** @type {{ c: number, r: number }[]} */
        const path = new Array(flat.length);
        for (let i = 0; i < flat.length; i++) path[i] = { c: flat[i].col, r: flat[i].row };
        return path;
    }
}

/** @param {number} cols @param {number} rows */
export function createCorridorGridPathfinder(cols, rows) {
    return new CorridorGridPathfinder(cols, rows);
}
