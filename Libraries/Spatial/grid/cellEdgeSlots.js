/** Cardinal edge slot count per grid cell (N/E/S/W). */
export const CELL_EDGE_SIDES = 4;
/** Byte stride of one edge-slot ref in nav sim SAB (`Int32Array`). */
export const CELL_EDGE_SLOT_BYTES = CELL_EDGE_SIDES * 4;
/** @param {number} cellIdx */
export function cellEdgeSlotBase(cellIdx) {
    return cellIdx * CELL_EDGE_SIDES;
}
/** @param {number} cellIdx @param {number} side 0=N, 1=E, 2=S, 3=W */
export function cellEdgeSlotOffset(cellIdx, side) {
    return cellIdx * CELL_EDGE_SIDES + side;
}
