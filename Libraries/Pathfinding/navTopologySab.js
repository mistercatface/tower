import { CELL_EDGE_SLOT_BYTES, CELL_EDGE_SIDES, cellEdgeSlotBase } from "../Spatial/grid/cellEdgeSlots.js";
import { cellInRect, colRowToIndex, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { diagonalStepOpen } from "../Spatial/grid/vertexPassability.js";
import { clampCellBoundsToGrid, forEachDenseCellInBounds, forEachDenseCellInRect, padCellBoundsToGrid } from "../DataStructures/CellRect.js";
/** Octile step slots per cell in nav snapshot CSR. */
export const OCTILE_DIRS_PER_CELL = 8;
export const OCTILE_NEIGHBOR_BYTES = OCTILE_DIRS_PER_CELL * 4;
const CARDINAL_BITS = { "1,0": 1, "0,1": 2, "-1,0": 4, "0,-1": 8 };
const OCTILE_REVERSE_DIR = OCTILE_OFFSETS.map(({ dc, dr }) => OCTILE_OFFSETS.findIndex(({ dc: dc2, dr: dr2 }) => dc2 === -dc && dr2 === -dr));
/** @param {number} cellIdx */
export function octileNeighborBase(cellIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL;
}
/** @param {number} cellIdx @param {number} dirIdx */
export function octileNeighborOffset(cellIdx, dirIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL + dirIdx;
}
/** @typedef {{ blocked: Uint8Array, octileNeighbors: Int32Array }} NavTopology */
/**
 * @typedef {object} NavTopologySabArena
 * @property {number} cellCount
 * @property {SharedArrayBuffer} sabBlocked
 * @property {SharedArrayBuffer} sabGridFill
 * @property {SharedArrayBuffer} sabFloorKind
 * @property {SharedArrayBuffer} sabFloorFacing
 * @property {SharedArrayBuffer} sabEdgeSlots
 * @property {SharedArrayBuffer} sabOctileNeighbors
 * @property {SharedArrayBuffer} sabOctilePredecessors
 * @property {SharedArrayBuffer} sabCardinalOpen
 * @property {SharedArrayBuffer} sabVertexPassability
 * @property {Uint8Array} blocked
 * @property {Uint8Array} gridFill
 * @property {Uint8Array} floorKind
 * @property {Uint8Array} floorFacing
 * @property {Int32Array} edgeSlots
 * @property {Int32Array} octileNeighbors
 * @property {Int32Array} octilePredecessors
 * @property {Uint8Array} cardinalOpen
 * @property {Uint8Array} vertexPassability
 * @property {NavTopology} topologyHandle
 */
/** @param {NavTopologySabArena} arena @returns {NavTopology} */
export function navTopologyFromArena(arena) {
    return arena.topologyHandle;
}
/** @param {ArrayBufferLike} sabBlocked @param {ArrayBufferLike} sabOctileNeighbors @param {ArrayBufferLike} sabOctilePredecessors @returns {NavTopology & { octilePredecessors: Int32Array }} */
export function navTopologyFromSab(sabBlocked, sabOctileNeighbors, sabOctilePredecessors) {
    return { blocked: new Uint8Array(sabBlocked), octileNeighbors: new Int32Array(sabOctileNeighbors), octilePredecessors: new Int32Array(sabOctilePredecessors) };
}
/** @param {number} cellCount @param {number} vertCount */
export function createNavTopologySabArena(cellCount, vertCount) {
    const vertBytes = Math.max(vertCount, 4);
    /** @type {NavTopologySabArena} */
    const arena = {
        cellCount,
        sabBlocked: new SharedArrayBuffer(cellCount),
        sabGridFill: new SharedArrayBuffer(cellCount),
        sabFloorKind: new SharedArrayBuffer(cellCount),
        sabFloorFacing: new SharedArrayBuffer(cellCount),
        sabEdgeSlots: new SharedArrayBuffer(cellCount * CELL_EDGE_SLOT_BYTES),
        sabOctileNeighbors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES),
        sabOctilePredecessors: new SharedArrayBuffer(cellCount * OCTILE_NEIGHBOR_BYTES),
        sabCardinalOpen: new SharedArrayBuffer(cellCount),
        sabVertexPassability: new SharedArrayBuffer(vertBytes),
        blocked: undefined,
        gridFill: undefined,
        floorKind: undefined,
        floorFacing: undefined,
        edgeSlots: undefined,
        octileNeighbors: undefined,
        octilePredecessors: undefined,
        cardinalOpen: undefined,
        vertexPassability: undefined,
        topologyHandle: undefined,
    };
    bindNavTopologySabViews(arena);
    return arena;
}
/** @param {NavTopologySabArena} arena */
export function bindNavTopologySabViews(arena) {
    arena.blocked = new Uint8Array(arena.sabBlocked);
    arena.gridFill = new Uint8Array(arena.sabGridFill);
    arena.floorKind = new Uint8Array(arena.sabFloorKind);
    arena.floorFacing = new Uint8Array(arena.sabFloorFacing);
    arena.edgeSlots = new Int32Array(arena.sabEdgeSlots);
    arena.octileNeighbors = new Int32Array(arena.sabOctileNeighbors);
    arena.octilePredecessors = new Int32Array(arena.sabOctilePredecessors);
    arena.cardinalOpen = new Uint8Array(arena.sabCardinalOpen);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
    if (!arena.topologyHandle) arena.topologyHandle = { blocked: arena.blocked, octileNeighbors: arena.octileNeighbors };
    else {
        arena.topologyHandle.blocked = arena.blocked;
        arena.topologyHandle.octileNeighbors = arena.octileNeighbors;
    }
}
/** @param {NavTopologySabArena} arena @param {number} vertCount */
export function growNavTopologyVertexSab(arena, vertCount) {
    const vertBytes = Math.max(vertCount, 4);
    if (arena.sabVertexPassability.byteLength >= vertBytes) return;
    arena.sabVertexPassability = new SharedArrayBuffer(vertBytes);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
}
export function expandNavTopologyBakeBounds(bounds, cols, rows, padding = 1) {
    return padCellBoundsToGrid(bounds, cols, rows, padding);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {NavTopologySabArena} arena @param {import("../DataStructures/CellRect.js").CellBounds | null} damageBounds */
export function packNavTopologyFromGrid(grid, arena, damageBounds = null) {
    const { cols } = grid;
    if (!damageBounds) {
        arena.gridFill.set(grid.grid);
        arena.floorKind.set(grid.floorStore.kind);
        arena.floorFacing.set(grid.floorStore.facing);
        arena.edgeSlots.set(grid.edgeStore.slots);
        return;
    }
    const bounds = clampCellBoundsToGrid(damageBounds, cols, grid.rows);
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        const rowStart = row * cols + bounds.startCol;
        const span = bounds.endCol - bounds.startCol + 1;
        arena.gridFill.set(grid.grid.subarray(rowStart, rowStart + span), rowStart);
        arena.floorKind.set(grid.floorStore.kind.subarray(rowStart, rowStart + span), rowStart);
        arena.floorFacing.set(grid.floorStore.facing.subarray(rowStart, rowStart + span), rowStart);
    }
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (col, row, idx) => {
        const slotBase = cellEdgeSlotBase(idx);
        arena.edgeSlots.set(grid.edgeStore.slots.subarray(slotBase, slotBase + CELL_EDGE_SIDES), slotBase);
    });
}
/** @param {Uint8Array} gridFill @param {Uint8Array} blocked @param {number} cols @param {import("../DataStructures/CellRect.js").CellBounds | null} damageBounds */
export function recomputeBlockedFromGridFill(gridFill, blocked, cols, damageBounds = null) {
    if (!damageBounds) {
        for (let idx = 0; idx < gridFill.length; idx++) blocked[idx] = gridFill[idx] !== 0 ? 1 : 0;
        return;
    }
    const bounds = clampCellBoundsToGrid(damageBounds, cols, gridFill.length / cols);
    forEachDenseCellInRect(bounds.startCol, bounds.endCol, bounds.startRow, bounds.endRow, cols, (col, row, idx) => {
        blocked[idx] = gridFill[idx] !== 0 ? 1 : 0;
    });
}
export function buildOctileNeighborsFromTopologyBounds(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, bounds) {
    forEachDenseCellInBounds(bounds, cols, (col, row, idx) => {
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
/** @param {Int32Array} octileNeighbors @param {Int32Array} octilePredecessors @param {number} cols @param {number} rows @param {import("../DataStructures/CellRect.js").CellBounds | null} targetBounds */
export function buildOctilePredecessorsFromForwardGrid(octileNeighbors, octilePredecessors, cols, rows, targetBounds = null) {
    const cellCount = cols * rows;
    if (!targetBounds) octilePredecessors.fill(-1);
    else
        forEachDenseCellInRect(targetBounds.startCol, targetBounds.endCol, targetBounds.startRow, targetBounds.endRow, cols, (col, row, idx) => {
            const base = octileNeighborBase(idx);
            for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) octilePredecessors[base + i] = -1;
        });
    for (let idx = 0; idx < cellCount; idx++) {
        const base = octileNeighborBase(idx);
        for (let i = 0; i < OCTILE_DIRS_PER_CELL; i++) {
            const nIdx = octileNeighbors[base + i];
            if (nIdx < 0) continue;
            if (targetBounds) {
                const col = nIdx % cols;
                const row = (nIdx / cols) | 0;
                if (col < targetBounds.startCol || col > targetBounds.endCol || row < targetBounds.startRow || row > targetBounds.endRow) continue;
            }
            octilePredecessors[octileNeighborOffset(nIdx, OCTILE_REVERSE_DIR[i])] = idx;
        }
    }
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology @param {number} col @param {number} row */
export function navIsBlocked(frame, topology, col, row) {
    const { cols, rows } = frame;
    if (!cellInRect(col, row, cols, rows)) return true;
    return topology.blocked[colRowToIndex(col, row, cols)] !== 0;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function navCanStep(frame, topology, fromCol, fromRow, toCol, toRow) {
    const { cols, rows } = frame;
    if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) return false;
    const fromIdx = colRowToIndex(fromCol, fromRow, cols);
    if (topology.blocked[fromIdx]) return false;
    const toIdx = colRowToIndex(toCol, toRow, cols);
    for (let i = 0; i < OCTILE_OFFSETS.length; i++) {
        const { dc, dr } = OCTILE_OFFSETS[i];
        if (fromCol + dc === toCol && fromRow + dr === toRow) return topology.octileNeighbors[octileNeighborOffset(fromIdx, i)] === toIdx;
    }
    return false;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function createNavLocalView(frame, topology) {
    return { canStep: (fromCol, fromRow, toCol, toRow) => navCanStep(frame, topology, fromCol, fromRow, toCol, toRow) };
}
