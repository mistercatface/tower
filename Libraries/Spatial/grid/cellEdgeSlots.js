/** Cardinal edge slot count per grid cell (N/W). Shared boundaries mean East/South map to neighbor West/North. */
export const CELL_EDGE_SIDES = 2;
/** Byte stride of one edge-slot ref in nav sim SAB (`Int32Array`). */
export const CELL_EDGE_SLOT_BYTES = CELL_EDGE_SIDES * 4;
/** @param {number} cellIdx */
export function cellEdgeSlotBase(cellIdx) {
    return cellIdx * CELL_EDGE_SIDES;
}
/** @param {number} cellIdx @param {number} side 0=N, 1=E, 2=S, 3=W @param {number} cols */
export function cellEdgeSlotOffset(cellIdx, side, cols) {
    const col = cellIdx % cols;
    const row = (cellIdx / cols) | 0;
    const stride = cols + 1;
    if (side === 0) return (col + row * stride) * 2 + 0; // North
    if (side === 1) return (col + 1 + row * stride) * 2 + 1; // East (West of cell to right)
    if (side === 2) return (col + (row + 1) * stride) * 2 + 0; // South (North of cell below)
    return (col + row * stride) * 2 + 1; // West
}
