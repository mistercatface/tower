import { worldToGridAtOrigin, gridToWorldAtOrigin } from "../Spatial/grid/GridCoords.js";
import { cellInRect, colRowToIndex, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { diagonalStepOpen } from "../Spatial/grid/vertexPassability.js";
/**
 * @typedef {object} GridNavSnapshot
 * @property {string} cacheKey
 * @property {number} cols
 * @property {number} rows
 * @property {number} cellSize
 * @property {number} cellHalfSize
 * @property {number} minX
 * @property {number} minY
 * @property {Uint8Array} blocked
 * @property {Int32Array} octileNeighbors
 * @property {Int32Array} hopOffsets
 * @property {Int32Array} hopExitIdx
 * @property {Uint8Array} hopCost
 */
const CARDINAL_BITS = { "1,0": 1, "0,1": 2, "-1,0": 4, "0,-1": 8 };
function bakeHopCsr(grid, blocked, cols, rows) {
    const size = cols * rows;
    const hopOffsets = new Int32Array(size + 1);
    const hopExitIdx = [];
    const hopCost = [];
    let write = 0;
    for (let idx = 0; idx < size; idx++) {
        hopOffsets[idx] = write;
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const hops = grid.getBoundaryHops(col, row);
        if (hops)
            for (let i = 0; i < hops.length; i++) {
                const { exitCol, exitRow, cost } = hops[i];
                if (blocked[colRowToIndex(exitCol, exitRow, cols)]) continue;
                hopExitIdx.push(colRowToIndex(exitCol, exitRow, cols));
                hopCost.push(cost);
                write++;
            }
    }
    hopOffsets[size] = write;
    return { hopOffsets, hopExitIdx: Int32Array.from(hopExitIdx), hopCost: Uint8Array.from(hopCost) };
}
function bakeOctileNeighbors(grid, cols, rows, blocked, octileNeighbors, startRow, endRow) {
    for (let row = startRow; row < endRow; row++)
        for (let col = 0; col < cols; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (blocked[idx]) continue;
            const base = idx * 8;
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
                const { dc, dr } = OCTILE_OFFSETS[i];
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, cols, rows)) continue;
                if (grid.canStep(col, row, nc, nr)) octileNeighbors[base + i] = colRowToIndex(nc, nr, cols);
            }
        }
}
/** Worker/main-safe octile bake from prepacked topology (no grid.canStep). */
export function buildOctileNeighborsFromTopology(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors) {
    octileNeighbors.fill(-1);
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (blocked[idx]) continue;
            const base = idx * 8;
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
                const { dc, dr } = OCTILE_OFFSETS[i];
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, cols, rows)) continue;
                const nIdx = colRowToIndex(nc, nr, cols);
                if (blocked[nIdx]) continue;
                const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & CARDINAL_BITS[`${dc},${dr}`]) !== 0 : diagonalStepOpen(blocked, vertexPassability, cols, rows, col, row, dc, dr);
                if (open) octileNeighbors[base + i] = nIdx;
            }
        }
}
export function packBlockedFromGrid(grid) {
    const size = grid.cols * grid.rows;
    const blocked = new Uint8Array(size);
    for (let idx = 0; idx < size; idx++) blocked[idx] = grid.grid[idx] !== 0 ? 1 : 0;
    return blocked;
}
export function buildGridNavSnapshot(grid, cacheKey) {
    const { cols, rows, cellSize, cellHalfSize, minX, minY } = grid;
    const size = cols * rows;
    const blocked = packBlockedFromGrid(grid);
    const octileNeighbors = new Int32Array(size * 8);
    bakeOctileNeighbors(grid, cols, rows, blocked, octileNeighbors, 0, rows);
    const hops = bakeHopCsr(grid, blocked, cols, rows);
    return { cacheKey, cols, rows, cellSize, cellHalfSize, minX, minY, blocked, octileNeighbors, ...hops };
}
export function snapshotNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid._vertexPassabilitySyncKey}:${grid.boundaryNavEpoch}:${grid.floorNavEpoch}`;
}
export function snapshotIsBlocked(snapshot, col, row) {
    if (!cellInRect(col, row, snapshot.cols, snapshot.rows)) return true;
    return snapshot.blocked[colRowToIndex(col, row, snapshot.cols)] !== 0;
}
export function snapshotWorldToGrid(snapshot, x, y) {
    return worldToGridAtOrigin(x, y, snapshot.minX, snapshot.minY, snapshot.cellSize);
}
export function snapshotGridToWorld(snapshot, col, row) {
    return gridToWorldAtOrigin(col, row, snapshot.minX, snapshot.minY, snapshot.cellSize);
}
export function snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow) {
    const { cols, rows } = snapshot;
    if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) return false;
    const fromIdx = colRowToIndex(fromCol, fromRow, cols);
    if (snapshot.blocked[fromIdx]) return false;
    const toIdx = colRowToIndex(toCol, toRow, cols);
    for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
        const { dc, dr } = OCTILE_OFFSETS[i];
        if (fromCol + dc === toCol && fromRow + dr === toRow) return snapshot.octileNeighbors[fromIdx * 8 + i] === toIdx;
    }
    return false;
}
export function snapshotForEachNavHop(snapshot, col, row, fn) {
    const { cols, hopOffsets, hopExitIdx, hopCost } = snapshot;
    const idx = colRowToIndex(col, row, cols);
    const start = hopOffsets[idx];
    const end = hopOffsets[idx + 1];
    for (let i = start; i < end; i++) {
        const exitIdx = hopExitIdx[i];
        fn(exitIdx % cols, (exitIdx / cols) | 0, hopCost[i]);
    }
}
export function createSnapshotLocalNavView(snapshot) {
    return { canStep: (fromCol, fromRow, toCol, toRow) => snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow), forEachNavHop: (col, row, fn) => snapshotForEachNavHop(snapshot, col, row, fn) };
}
