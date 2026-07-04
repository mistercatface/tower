import { CELL_EDGE_SLOT_BYTES, cellEdgeSlotOffset } from "../Spatial/grid/CellEdgeStore.js";
import { cellInRect, OCTILE_OFFSETS } from "../Spatial/grid/GridUtils.js";
import { diagonalStepOpen, getCardinalBit } from "../Spatial/grid/boundaryOccupancy.js";
import { clampCellBoundsToGrid, forEachDenseCellInBounds, forEachDenseCellInRect, padCellBoundsToGrid } from "../DataStructures/CellRect.js";
/** Octile step slots per cell in nav snapshot CSR. */
export const OCTILE_DIRS_PER_CELL = 8;
export const OCTILE_NEIGHBOR_BYTES = OCTILE_DIRS_PER_CELL * 4;
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
export function createNavTopologySabArena(cellCount, vertCount, cols = 0, rows = 0) {
    const vertBytes = Math.max(vertCount, 4);
    const expCellCount = cols > 0 && rows > 0 ? (cols + 1) * (rows + 1) : cellCount;
    /** @type {NavTopologySabArena} */
    const arena = {
        cellCount,
        sabBlocked: new SharedArrayBuffer(cellCount),
        sabGridFill: new SharedArrayBuffer(cellCount),
        sabFloorKind: new SharedArrayBuffer(cellCount),
        sabFloorFacing: new SharedArrayBuffer(cellCount),
        sabEdgeSlots: new SharedArrayBuffer(expCellCount * CELL_EDGE_SLOT_BYTES),
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
export function packNavTopologyFromGrid(grid, arena, idx = null) {
    const isBounds = idx !== null && typeof idx === "object";
    if (idx === null) {
        arena.gridFill.set(grid.grid);
        arena.floorKind.set(grid.floorStore.kind);
        arena.floorFacing.set(grid.floorStore.facing);
        arena.edgeSlots.set(grid.edgeStore.slots);
        return;
    }
    if (isBounds)
        forEachDenseCellInBounds(idx, grid.cols, (cellIdx) => {
            arena.gridFill[cellIdx] = grid.grid[cellIdx];
            arena.floorKind[cellIdx] = grid.floorStore.kind[cellIdx];
            arena.floorFacing[cellIdx] = grid.floorStore.facing[cellIdx];
            for (let side = 0; side < 4; side++) {
                const offset = cellEdgeSlotOffset(cellIdx, side);
                arena.edgeSlots[offset] = grid.edgeStore.slots[offset];
            }
        });
    else {
        arena.gridFill[idx] = grid.grid[idx];
        arena.floorKind[idx] = grid.floorStore.kind[idx];
        arena.floorFacing[idx] = grid.floorStore.facing[idx];
        for (let side = 0; side < 4; side++) {
            const offset = cellEdgeSlotOffset(idx, side);
            arena.edgeSlots[offset] = grid.edgeStore.slots[offset];
        }
    }
}
/** @param {Uint8Array} gridFill @param {Uint8Array} blocked @param {number} cols @param {number | null} idx */
export function recomputeBlockedFromGridFill(gridFill, blocked, cols, idx = null) {
    if (idx === null) {
        for (let i = 0; i < gridFill.length; i++) blocked[i] = gridFill[i] !== 0 ? 1 : 0;
        return;
    }
    blocked[idx] = gridFill[idx] !== 0 ? 1 : 0;
}
export function buildOctileNeighborsFromTopologyBounds(blocked, cardinalOpen, vertexPassability, cols, rows, octileNeighbors, bounds) {
    forEachDenseCellInBounds(bounds, cols, (idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
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
            const nIdx = nr * cols + nc;
            if (blocked[nIdx]) {
                octileNeighbors[octileNeighborOffset(idx, i)] = -1;
                continue;
            }
            const open = dc === 0 || dr === 0 ? (cardinalOpen[idx] & getCardinalBit(dc, dr)) !== 0 : diagonalStepOpen(cardinalOpen, vertexPassability, cols, rows, idx, dc, dr);
            octileNeighbors[octileNeighborOffset(idx, i)] = open ? nIdx : -1;
        }
    });
}
/** @param {Int32Array} octileNeighbors @param {Int32Array} octilePredecessors @param {number} cols @param {number} rows @param {import("../DataStructures/CellRect.js").CellBounds | null} targetBounds */
export function buildOctilePredecessorsFromForwardGrid(octileNeighbors, octilePredecessors, cols, rows, targetBounds = null) {
    const cellCount = cols * rows;
    if (!targetBounds) octilePredecessors.fill(-1);
    else
        forEachDenseCellInRect(targetBounds.startCol, targetBounds.endCol, targetBounds.startRow, targetBounds.endRow, cols, (idx) => {
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
    return topology.blocked[row * cols + col] !== 0;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function navCanStep(frame, topology, fromIdx, toIdx) {
    if (fromIdx < 0 || toIdx < 0) return false;
    const { cols, rows } = frame;
    const cellCount = cols * rows;
    if (fromIdx >= cellCount || toIdx >= cellCount) return false;
    if (topology.blocked[fromIdx]) return false;
    for (let dirIdx = 0; dirIdx < 8; dirIdx++) if (topology.octileNeighbors[octileNeighborOffset(fromIdx, dirIdx)] === toIdx) return true;
    return false;
}
/** @param {import("./GridNavSnapshot.js").GridFrame} frame @param {NavTopology} topology */
export function createNavLocalView(frame, topology) {
    return { canStepIdx: (fromIdx, toIdx) => navCanStep(frame, topology, fromIdx, toIdx) };
}
