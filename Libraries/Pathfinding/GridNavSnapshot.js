import { worldToGridAtOrigin, gridToWorldAtOrigin } from "../Spatial/grid/GridCoords.js";
import { cellInRect, colRowToIndex, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { diagonalStepOpen } from "../Spatial/grid/vertexPassability.js";
import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { octileNeighborBase, octileNeighborOffset } from "./navTopologySab.js";
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */
/** @typedef {{ minX: number, minY: number, cellSize: number, cols: number, rows: number, key: string }} GridFrame */
/**
 * @typedef {object} GridNavSnapshot
 * @property {string} cacheKey
 * @property {GridFrame} frame
 * @property {number} cellHalfSize
 * @property {Uint8Array} blocked
 * @property {Int32Array} octileNeighbors
 */
const CARDINAL_BITS = { "1,0": 1, "0,1": 2, "-1,0": 4, "0,-1": 8 };
/** Stable id for obstacle-grid frame — resize or origin shift changes this. */
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
/** @param {{ minX: number, minY: number, cellSize: number, cols: number, rows: number }} grid */
export function gridFrameFromGrid(grid) {
    return { minX: grid.minX, minY: grid.minY, cellSize: grid.cellSize, cols: grid.cols, rows: grid.rows, key: gridNavFrameKey(grid) };
}
/** @param {GridFrame} frame @param {string} cacheKey @param {Uint8Array} blocked @param {Int32Array} octileNeighbors */
export function createWorkerNavSnapshotView(frame, cacheKey, blocked, octileNeighbors) {
    return { cacheKey, frame, cellHalfSize: frame.cellSize * 0.5, blocked, octileNeighbors };
}
/** Worker/main-safe octile bake from prepacked topology (no grid.canStep). */
export function buildOctileNeighborsFromTopology(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors) {
    buildOctileNeighborsFromTopologyRect(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, 0, cols - 1, 0, rows - 1);
}
/** Rebake octile neighbors for cells in [startCol..endCol] × [startRow..endRow] inclusive. */
export function buildOctileNeighborsFromTopologyRect(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, startCol, endCol, startRow, endRow) {
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (col, row, idx) => {
        const base = octileNeighborBase(idx);
        if (blocked[idx]) {
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) octileNeighbors[base + i] = -1;
            return;
        }
        for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
            const { dc, dr } = OCTILE_OFFSETS[i];
            const nc = col + dc;
            const nr = row + dr;
            if (!cellInRect(nc, nr, cols, rows)) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const nIdx = colRowToIndex(nc, nr, cols);
            if (blocked[nIdx]) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & CARDINAL_BITS[`${dc},${dr}`]) !== 0 : diagonalStepOpen(cardinalOpen, vertexPassability, cols, rows, col, row, dc, dr);
            octileNeighbors[octileNeighborOffset(idx, i)] = open ? nIdx : -1;
        }
    });
}
export function snapshotIsBlocked(snapshot, col, row) {
    const { cols, rows } = snapshot.frame;
    if (!cellInRect(col, row, cols, rows)) return true;
    return snapshot.blocked[colRowToIndex(col, row, cols)] !== 0;
}
export function snapshotWorldToGrid(snapshot, x, y) {
    const { minX, minY, cellSize } = snapshot.frame;
    return worldToGridAtOrigin(x, y, minX, minY, cellSize);
}
export function snapshotGridToWorld(snapshot, col, row) {
    const { minX, minY, cellSize } = snapshot.frame;
    return gridToWorldAtOrigin(col, row, minX, minY, cellSize);
}
export function snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow) {
    const { cols, rows } = snapshot.frame;
    if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) return false;
    const fromIdx = colRowToIndex(fromCol, fromRow, cols);
    if (snapshot.blocked[fromIdx]) return false;
    const toIdx = colRowToIndex(toCol, toRow, cols);
    for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
        const { dc, dr } = OCTILE_OFFSETS[i];
        if (fromCol + dc === toCol && fromRow + dr === toRow) return snapshot.octileNeighbors[octileNeighborOffset(fromIdx, i)] === toIdx;
    }
    return false;
}
export function createSnapshotLocalNavView(snapshot) {
    return { canStep: (fromCol, fromRow, toCol, toRow) => snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow) };
}
