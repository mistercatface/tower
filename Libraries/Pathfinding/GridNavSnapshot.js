import { worldToGridAtOrigin, gridToWorldAtOrigin } from "../Spatial/grid/GridCoords.js";
import { cellInRect, colRowToIndex, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { diagonalStepOpen } from "../Spatial/grid/vertexPassability.js";
import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
/** Octile + diagonal vertex passability can affect neighbors up to 2 cells away. */
export const NAV_TOPOLOGY_PATCH_MARGIN = 2;
/** Rebake shell so cells outside the data rect drop edges into changed cells. */
export const NAV_TOPOLOGY_OCTILE_SHELL = 1;
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */
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
/** @param {CellBounds} bounds @param {number} cols @param {number} rows @param {number} [margin] */
export function expandCellBoundsForNavPatch(bounds, cols, rows, margin = NAV_TOPOLOGY_PATCH_MARGIN) {
    return {
        startCol: Math.max(0, bounds.startCol - margin),
        endCol: Math.min(cols - 1, bounds.endCol + margin),
        startRow: Math.max(0, bounds.startRow - margin),
        endRow: Math.min(rows - 1, bounds.endRow + margin),
    };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {CellBounds} bounds @param {Uint8Array} blocked */
export function packBlockedIntoRect(grid, bounds, blocked) {
    const { cols } = grid;
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (col, row, idx) => {
        blocked[idx] = grid.grid[idx] !== 0 ? 1 : 0;
    });
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {Uint8Array} gridFill @param {Uint8Array} floorKind @param {Uint8Array} floorFacing @param {Int32Array} edgeSlots */
export function packNavSimSabFromGrid(grid, gridFill, floorKind, floorFacing, edgeSlots) {
    gridFill.set(grid.grid);
    floorKind.set(grid.floorStore.kind);
    floorFacing.set(grid.floorStore.facing);
    edgeSlots.set(grid.edgeStore.slots);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {CellBounds} bounds @param {Uint8Array} gridFill @param {Uint8Array} floorKind @param {Uint8Array} floorFacing @param {Int32Array} edgeSlots */
export function copyNavSimSabRect(grid, bounds, gridFill, floorKind, floorFacing, edgeSlots) {
    const { cols } = grid;
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (col, row, idx) => {
        gridFill[idx] = grid.grid[idx];
        floorKind[idx] = grid.floorStore.kind[idx];
        floorFacing[idx] = grid.floorStore.facing[idx];
        const slotBase = idx * 4;
        const srcBase = idx * 4;
        edgeSlots[slotBase] = grid.edgeStore.slots[srcBase];
        edgeSlots[slotBase + 1] = grid.edgeStore.slots[srcBase + 1];
        edgeSlots[slotBase + 2] = grid.edgeStore.slots[srcBase + 2];
        edgeSlots[slotBase + 3] = grid.edgeStore.slots[srcBase + 3];
    });
}
export function snapshotNavCacheKey(grid) {
    return `${grid.wallGridRevision}:${grid.gridTopologyEpoch}:${grid.floorNavEpoch}:${grid._passagePowerNavKey ?? ""}`;
}
/** Stable id for worker grid frame — sent only when this changes (resize / origin shift). */
export function gridNavFrameKey(grid) {
    return `${grid.cols}:${grid.rows}:${grid.minX}:${grid.minY}:${grid.cellSize}`;
}
/** Worker/main-safe octile bake from prepacked topology (no grid.canStep). */
export function buildOctileNeighborsFromTopology(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors) {
    buildOctileNeighborsFromTopologyRect(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, 0, cols - 1, 0, rows - 1);
}
/** Rebake octile neighbors for cells in [startCol..endCol] × [startRow..endRow] inclusive. */
export function buildOctileNeighborsFromTopologyRect(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, startCol, endCol, startRow, endRow) {
    forEachDenseCellInRect(startCol, endCol, startRow, endRow, cols, (col, row, idx) => {
        const base = idx * 8;
        if (blocked[idx]) {
            for (let i = 0; i < OCTILE_OFFSETS.length; i++) octileNeighbors[base + i] = -1;
            return;
        }
        for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
            const { dc, dr } = OCTILE_OFFSETS[i];
            const nc = col + dc;
            const nr = row + dr;
            if (!cellInRect(nc, nr, cols, rows)) {
                octileNeighbors[base + i] = -1;
                continue;
            }
            const nIdx = colRowToIndex(nc, nr, cols);
            if (blocked[nIdx]) {
                octileNeighbors[base + i] = -1;
                continue;
            }
            const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & CARDINAL_BITS[`${dc},${dr}`]) !== 0 : diagonalStepOpen(blocked, vertexPassability, cols, rows, col, row, dc, dr);
            octileNeighbors[base + i] = open ? nIdx : -1;
        }
    });
}
export function packBlockedFromGrid(grid) {
    const size = grid.cols * grid.rows;
    const blocked = new Uint8Array(size);
    for (let idx = 0; idx < size; idx++) blocked[idx] = grid.grid[idx] !== 0 ? 1 : 0;
    return blocked;
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
export function snapshotCanBoundaryHop(snapshot, fromCol, fromRow, exitCol, exitRow) {
    const { cols, hopOffsets, hopExitIdx } = snapshot;
    if (!hopOffsets || !hopExitIdx) return false;
    const fromIdx = colRowToIndex(fromCol, fromRow, cols);
    const exitIdx = colRowToIndex(exitCol, exitRow, cols);
    const start = hopOffsets[fromIdx];
    const end = hopOffsets[fromIdx + 1];
    for (let i = start; i < end; i++) if (hopExitIdx[i] === exitIdx) return true;
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
    return {
        canStep: (fromCol, fromRow, toCol, toRow) => snapshotCanStep(snapshot, fromCol, fromRow, toCol, toRow) || snapshotCanBoundaryHop(snapshot, fromCol, fromRow, toCol, toRow),
        forEachNavHop: (col, row, fn) => snapshotForEachNavHop(snapshot, col, row, fn),
    };
}
/** Zero-copy nav snapshot view over worker SAB buffers (no main-thread octile bake). */
export function createWorkerNavSnapshotView(grid, cacheKey, blocked, octileNeighbors, hopOffsets, hopExitIdx, hopCost) {
    return {
        cacheKey,
        cols: grid.cols,
        rows: grid.rows,
        cellSize: grid.cellSize,
        cellHalfSize: grid.cellHalfSize,
        minX: grid.minX,
        minY: grid.minY,
        blocked,
        octileNeighbors,
        hopOffsets,
        hopExitIdx,
        hopCost,
    };
}
