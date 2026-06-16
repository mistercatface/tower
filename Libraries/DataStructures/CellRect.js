import { KEY_STRIDE } from "./CellKey.js";
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */
export function emptyCellBounds() {
    return { startCol: Infinity, endCol: -Infinity, startRow: Infinity, endRow: -Infinity };
}
/** @param {CellBounds} bounds */
export function isEmptyCellBounds(bounds) {
    return bounds.startCol === Infinity;
}
/** @param {CellBounds} bounds @param {number} cols @param {number} rows @returns {CellBounds} */
export function clampCellBoundsToGrid(bounds, cols, rows) {
    return {
        startCol: Math.max(0, bounds.startCol),
        endCol: Math.min(cols - 1, bounds.endCol),
        startRow: Math.max(0, bounds.startRow),
        endRow: Math.min(rows - 1, bounds.endRow),
    };
}
/** @param {CellBounds} bounds @param {number} col @param {number} row @returns {CellBounds} */
export function growCellBounds(bounds, col, row) {
    if (col < bounds.startCol) bounds.startCol = col;
    if (col > bounds.endCol) bounds.endCol = col;
    if (row < bounds.startRow) bounds.startRow = row;
    if (row > bounds.endRow) bounds.endRow = row;
    return bounds;
}
/** @param {number} col @param {number} row @returns {CellBounds} */
export function cellBoundsAt(col, row) {
    return { startCol: col, endCol: col, startRow: row, endRow: row };
}
/** @param {CellBounds | null} a @param {CellBounds | null} b @returns {CellBounds | null} */
export function unionCellBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { startCol: Math.min(a.startCol, b.startCol), endCol: Math.max(a.endCol, b.endCol), startRow: Math.min(a.startRow, b.startRow), endRow: Math.max(a.endRow, b.endRow) };
}
/** @param {(CellBounds | null)[]} parts @returns {CellBounds | null} */
export function unionCellBoundsList(parts) {
    let out = null;
    for (let i = 0; i < parts.length; i++) out = unionCellBounds(out, parts[i]);
    return out;
}
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
