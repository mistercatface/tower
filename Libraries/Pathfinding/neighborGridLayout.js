import { OCTILE_DIRS_PER_CELL, OCTILE_NEIGHBOR_BYTES, octileNeighborBase, octileNeighborOffset } from "../Navigation/navigation.js";
export const OCTILE_NEIGHBOR_GRID_LAYOUT = Object.freeze({
    directionCount: OCTILE_DIRS_PER_CELL,
    bytesPerCell: OCTILE_NEIGHBOR_BYTES,
    bufferByteLength(cellCount) {
        return cellCount * this.bytesPerCell;
    },
    cellBase(cellIdx) {
        return octileNeighborBase(cellIdx);
    },
    cellOffset(cellIdx, dirIdx) {
        return octileNeighborOffset(cellIdx, dirIdx);
    },
    clearCell(neighborGrid, cellIdx) {
        const base = this.cellBase(cellIdx);
        for (let dir = 0; dir < this.directionCount; dir++) neighborGrid[base + dir] = -1;
    },
});
