import { CELL_EDGE_SIDES, CELL_EDGE_SLOT_BYTES } from "../Spatial/grid/cellEdgeSlots.js";
/** Octile step slots per cell in nav snapshot CSR. */
export const OCTILE_DIRS_PER_CELL = 8;
export const OCTILE_NEIGHBOR_BYTES = OCTILE_DIRS_PER_CELL * 4;
/** @param {number} cellIdx */
export function octileNeighborBase(cellIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL;
}
/** @param {number} cellIdx @param {number} dirIdx */
export function octileNeighborOffset(cellIdx, dirIdx) {
    return cellIdx * OCTILE_DIRS_PER_CELL + dirIdx;
}
/**
 * @typedef {object} NavTopologySabArena
 * @property {number} cellCount
 * @property {SharedArrayBuffer} sabBlocked
 * @property {SharedArrayBuffer} sabGridFill
 * @property {SharedArrayBuffer} sabFloorKind
 * @property {SharedArrayBuffer} sabFloorFacing
 * @property {SharedArrayBuffer} sabEdgeSlots
 * @property {SharedArrayBuffer} sabOctileNeighbors
 * @property {SharedArrayBuffer} sabCardinalOpen
 * @property {SharedArrayBuffer} sabVertexPassability
 * @property {Uint8Array} blocked
 * @property {Uint8Array} gridFill
 * @property {Uint8Array} floorKind
 * @property {Uint8Array} floorFacing
 * @property {Int32Array} edgeSlots
 * @property {Int32Array} octileNeighbors
 * @property {Uint8Array} cardinalOpen
 * @property {Uint8Array} vertexPassability
 */
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
        sabCardinalOpen: new SharedArrayBuffer(cellCount),
        sabVertexPassability: new SharedArrayBuffer(vertBytes),
        blocked: undefined,
        gridFill: undefined,
        floorKind: undefined,
        floorFacing: undefined,
        edgeSlots: undefined,
        octileNeighbors: undefined,
        cardinalOpen: undefined,
        vertexPassability: undefined,
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
    arena.cardinalOpen = new Uint8Array(arena.sabCardinalOpen);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
}
/** @param {NavTopologySabArena} arena @param {number} vertCount */
export function growNavTopologyVertexSab(arena, vertCount) {
    const vertBytes = Math.max(vertCount, 4);
    if (arena.sabVertexPassability.byteLength >= vertBytes) return;
    arena.sabVertexPassability = new SharedArrayBuffer(vertBytes);
    arena.vertexPassability = new Uint8Array(arena.sabVertexPassability);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {NavTopologySabArena} arena */
export function packNavTopologyFromGrid(grid, arena) {
    arena.gridFill.set(grid.grid);
    arena.floorKind.set(grid.floorStore.kind);
    arena.floorFacing.set(grid.floorStore.facing);
    arena.edgeSlots.set(grid.edgeStore.slots);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function packBlockedFromGrid(grid) {
    const size = grid.cols * grid.rows;
    const blocked = new Uint8Array(size);
    for (let idx = 0; idx < size; idx++) blocked[idx] = grid.grid[idx] !== 0 ? 1 : 0;
    return blocked;
}
