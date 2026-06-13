/**
 * Packed (col, row) key for sparse unbounded grids.
 *
 * World AABB → cell index range uses minCol/maxCol/minRow/maxRow (see boundsToCellRect).
 * Wall bake / obstacle patches use startCol/endCol/startRow/endRow for the same indices.
 */
export const KEY_STRIDE = 65536;
const EDGE_KEY_STRIDE = KEY_STRIDE * KEY_STRIDE;
export function packCellKey(col, row) {
    return col + row * KEY_STRIDE;
}
/** Sparse health for railWall edges — side encoded above cell row/col key space. */
export function packEdgeCellKey(col, row, side) {
    return packCellKey(col, row) + (side + 1) * EDGE_KEY_STRIDE;
}
export function unpackCellKey(key) {
    return { col: key % KEY_STRIDE, row: (key / KEY_STRIDE) | 0 };
}
export function worldToCell(x, y, cellSize) {
    return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}
export function worldToSparseCellKey(x, y, cellSize) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    return packCellKey(col, row);
}
export function boundsToCellRect(minX, minY, maxX, maxY, cellSize) {
    return { minCol: Math.floor(minX / cellSize), maxCol: Math.floor(maxX / cellSize), minRow: Math.floor(minY / cellSize), maxRow: Math.floor(maxY / cellSize) };
}
