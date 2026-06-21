export function colRowToIndex(col, row, cols) {
    return row * cols + col;
}
/** @typedef {number} GlobalCellIdx Dense index on the obstacle grid: colRowToIndex(col, row, grid.cols). */
/** @typedef {number} LayoutCellIdx Dense index within a {@link CellIndexLayout} rect (local to origin/stride). */
/** @param {number} col @param {number} row @param {number} gridCols @returns {GlobalCellIdx} */
export function globalCellIdx(col, row, gridCols) {
    return colRowToIndex(col, row, gridCols);
}
/** @param {number} originCol @param {number} originRow @param {number} patchCols @param {number} patchRows @returns {CellIndexLayout} */
export function createPatchLayout(originCol, originRow, patchCols, patchRows) {
    return { originCol, originRow, strideCols: patchCols, cellCount: patchCols * patchRows };
}
/** @param {LayoutCellIdx} idx @param {CellIndexLayout} layout */
export function layoutIndexToAbsColRow(idx, layout) {
    return { col: (idx % layout.strideCols) + layout.originCol, row: Math.floor(idx / layout.strideCols) + layout.originRow };
}
/** Dense index for absolute (col, row) within a bounded layout rect. */
export function layoutCellIndex(absCol, absRow, originCol, originRow, strideCols) {
    return colRowToIndex(absCol - originCol, absRow - originRow, strideCols);
}
/** @param {number} idx @param {CellIndexLayout} layout @param {number} gridCols */
export function layoutIndexToGlobalIndex(idx, layout, gridCols) {
    const col = (idx % layout.strideCols) + layout.originCol;
    const row = Math.floor(idx / layout.strideCols) + layout.originRow;
    return colRowToIndex(col, row, gridCols);
}
/** @param {Iterable<number>} indices @param {CellIndexLayout} layout @param {number} gridCols */
export function layoutIndicesToGlobalIndices(indices, layout, gridCols) {
    /** @type {number[]} */
    const out = [];
    for (const idx of indices) out.push(layoutIndexToGlobalIndex(idx, layout, gridCols));
    return out;
}
/** @param {number} aIdx @param {number} bIdx @param {number} cellCount */
export function undirectedPairIndex(aIdx, bIdx, cellCount) {
    return aIdx < bIdx ? aIdx * cellCount + bIdx : bIdx * cellCount + aIdx;
}
/** @typedef {{ originCol: number, originRow: number, strideCols: number, cellCount: number }} CellIndexLayout */
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function gridCellLayout(grid) {
    return { originCol: 0, originRow: 0, strideCols: grid.cols, cellCount: grid.cols * grid.rows };
}
/** @param {number} col @param {number} row @param {number} cols @param {number} rows */
export function cellInRect(col, row, cols, rows) {
    return col >= 0 && col < cols && row >= 0 && row < rows;
}
export function indexToColRow(idx, cols) {
    return { col: idx % cols, row: Math.floor(idx / cols) };
}
export const CARDINAL_OFFSETS = [
    { dc: 0, dr: -1 },
    { dc: 1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
];
const GRID_SIDE_NEIGHBOR_LABELS = ["North neighbor", "East neighbor", "South neighbor", "West neighbor"];
/** Outward unit vector for grid side 0=N, 1=E, 2=S, 3=W. */
export function gridSideOutwardVector(side) {
    if (side === 0) return { x: 0, y: -1 };
    if (side === 1) return { x: 1, y: 0 };
    if (side === 2) return { x: 0, y: 1 };
    return { x: -1, y: 0 };
}
/** Neighbor cell reached by stepping outward across side. */
export function gridSideNeighborCell(col, row, side) {
    const { dc, dr } = CARDINAL_OFFSETS[side];
    return { col: col + dc, row: row + dr };
}
/** @param {number} side */
export function formatGridSideNeighborLabel(side) {
    return GRID_SIDE_NEIGHBOR_LABELS[side] ?? `Side ${side} neighbor`;
}
const GRID_EDGE_SIDE_FACING = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
/** Facing radians for grid edge side 0=N, 1=E, 2=S, 3=W. */
export function gridEdgeSideFacing(side) {
    return GRID_EDGE_SIDE_FACING[side];
}
export const OCTILE_OFFSETS = [
    { dc: 0, dr: -1, cost: 1 },
    { dc: 1, dr: 0, cost: 1 },
    { dc: 0, dr: 1, cost: 1 },
    { dc: -1, dr: 0, cost: 1 },
    { dc: 1, dr: -1, cost: Math.SQRT2 },
    { dc: 1, dr: 1, cost: Math.SQRT2 },
    { dc: -1, dr: 1, cost: Math.SQRT2 },
    { dc: -1, dr: -1, cost: Math.SQRT2 },
];
export function forEachCardinalNeighbor(col, row, cols, rows, fn) {
    for (const { dc, dr } of CARDINAL_OFFSETS) {
        const nc = col + dc;
        const nr = row + dr;
        if (cellInRect(nc, nr, cols, rows)) fn(nc, nr, colRowToIndex(nc, nr, cols));
    }
}
export function forEachOctileNeighbor(col, row, cols, rows, fn) {
    for (const { dc, dr, cost } of OCTILE_OFFSETS) {
        const nc = col + dc;
        const nr = row + dr;
        if (cellInRect(nc, nr, cols, rows)) fn(nc, nr, colRowToIndex(nc, nr, cols), cost);
    }
}
export function makeAdjacencyKey(idA, idB) {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}
export function manhattanDistance(col, row, targetCol, targetRow) {
    return Math.abs(col - targetCol) + Math.abs(row - targetRow);
}
export function octileDistance(col, row, targetCol, targetRow) {
    const dx = Math.abs(col - targetCol);
    const dy = Math.abs(row - targetRow);
    if (dx < dy) return dx * Math.SQRT2 + (dy - dx);
    return dy * Math.SQRT2 + (dx - dy);
}
