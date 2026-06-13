import { FLOOR_CELL_KIND } from "./FloorCell.js";
export class FloorCellStore {
    constructor() {
        /** @type {Uint8Array} */
        this.kind = new Uint8Array(0);
        /** @type {Uint8Array} cardinal index 0…3 */
        this.facing = new Uint8Array(0);
    }
    /** @param {number} cellCount */
    reset(cellCount) {
        this.kind = new Uint8Array(cellCount);
        this.facing = new Uint8Array(cellCount);
    }
    /**
     * @param {Uint8Array} oldKind
     * @param {Uint8Array} oldFacing
     * @param {number} oldCols
     * @param {number} oldRows
     * @param {number} colOffset
     * @param {number} rowOffset
     * @param {number} newCols
     * @param {number} newRows
     */
    remap(oldKind, oldFacing, oldCols, oldRows, colOffset, rowOffset, newCols, newRows) {
        const newKind = new Uint8Array(newCols * newRows);
        const newFacing = new Uint8Array(newCols * newRows);
        const oldSize = oldCols * oldRows;
        for (let idx = 0; idx < oldSize; idx++) {
            if (oldKind[idx] === FLOOR_CELL_KIND.None) continue;
            const col = idx % oldCols;
            const row = (idx / oldCols) | 0;
            const nc = col + colOffset;
            const nr = row + rowOffset;
            if (nc < 0 || nc >= newCols || nr < 0 || nr >= newRows) continue;
            const newIdx = nc + nr * newCols;
            newKind[newIdx] = oldKind[idx];
            newFacing[newIdx] = oldFacing[idx];
        }
        this.kind = newKind;
        this.facing = newFacing;
    }
    /** @param {number} idx */
    hasAnyAtIdx(idx) {
        return this.kind[idx] !== FLOOR_CELL_KIND.None;
    }
    /** @param {number} idx */
    isBeltAtIdx(idx) {
        return this.kind[idx] === FLOOR_CELL_KIND.Belt;
    }
    /** @param {number} idx @param {number} facingIndex */
    setBeltAtIdx(idx, facingIndex) {
        this.kind[idx] = FLOOR_CELL_KIND.Belt;
        this.facing[idx] = facingIndex;
    }
    /** @param {number} idx */
    clearAtIdx(idx) {
        this.kind[idx] = FLOOR_CELL_KIND.None;
        this.facing[idx] = 0;
    }
    /** @param {number} cellCount */
    hasAny() {
        const size = this.kind.length;
        for (let idx = 0; idx < size; idx++) if (this.kind[idx] !== FLOOR_CELL_KIND.None) return true;
        return false;
    }
}
