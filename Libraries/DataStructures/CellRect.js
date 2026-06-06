import { KEY_STRIDE } from "./CellKey.js";
/** Iterate sparse grid cells; fn(col, row, packedKey). */
export function forEachSparseCellInRect(minCol, maxCol, minRow, maxRow, fn) {
    for (let r = minRow; r <= maxRow; r++) {
        const rowKey = r * KEY_STRIDE;
        for (let c = minCol; c <= maxCol; c++) fn(c, r, c + rowKey);
    }
}
/** Iterate dense grid cells; fn(col, row, cellIndex). */
export function forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, cols, fn) {
    for (let r = minRow; r <= maxRow; r++) {
        const rowOffset = r * cols;
        for (let c = minCol; c <= maxCol; c++) fn(c, r, rowOffset + c);
    }
}
