/** @typedef {number} GlobalCellIdx Dense index on the obstacle grid: row * grid.cols + col. */
/** @typedef {number} LayoutCellIdx Dense index within a {@link CellIndexLayout} rect (local to origin/stride). */
export function createCellIndexLayout(originCol, originRow, cols, rows) {
    return { originCol, originRow, strideCols: cols, cellCount: cols * rows };
}
export function layoutCellRows(layout) {
    return layout.cellCount / layout.strideCols;
}
export function layoutContainsAbsCell(layout, col, row) {
    return col >= layout.originCol && col < layout.originCol + layout.strideCols && row >= layout.originRow && row < layout.originRow + layoutCellRows(layout);
}
export function layoutAbsToLocalCell(layout, col, row) {
    return { col: col - layout.originCol, row: row - layout.originRow };
}
export function layoutLocalToAbsCell(layout, col, row) {
    return { col: col + layout.originCol, row: row + layout.originRow };
}
/** Dense index for absolute (col, row) within a bounded layout rect. */
export function layoutCellIndex(absCol, absRow, originCol, originRow, strideCols) {
    return (absRow - originRow) * strideCols + (absCol - originCol);
}
export function layoutAbsCellIndex(layout, absCol, absRow) {
    return (absRow - layout.originRow) * layout.strideCols + (absCol - layout.originCol);
}
export function layoutLocalCellIndex(layout, localCol, localRow) {
    return localRow * layout.strideCols + localCol;
}
/** @param {number} idx @param {CellIndexLayout} layout @param {number} gridCols */
export function layoutIndexToGlobalIndex(idx, layout, gridCols) {
    const localRow = (idx / layout.strideCols) | 0;
    const localCol = idx - localRow * layout.strideCols;
    return (layout.originRow + localRow) * gridCols + (layout.originCol + localCol);
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
export function cellInRect(idx, cols, rows) {
    return idx >= 0 && idx < cols * rows;
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
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
            const nIdx = nr * cols + nc;
            if (cellInRect(nIdx, cols, rows)) fn(nc, nr, nIdx);
        }
    }
}
export function forEachOctileNeighbor(col, row, cols, rows, fn) {
    for (const { dc, dr, cost } of OCTILE_OFFSETS) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
            const nIdx = nr * cols + nc;
            if (cellInRect(nIdx, cols, rows)) fn(nc, nr, nIdx, cost);
        }
    }
}
export function makeAdjacencyKey(idA, idB) {
    return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}
export function manhattanDistanceIdx(idxA, idxB, cols) {
    const rowA = (idxA / cols) | 0;
    const colA = idxA - rowA * cols;
    const rowB = (idxB / cols) | 0;
    const colB = idxB - rowB * cols;
    return Math.abs(colA - colB) + Math.abs(rowA - rowB);
}
export function octileDistanceIdx(idxA, idxB, cols) {
    const rowA = (idxA / cols) | 0;
    const colA = idxA - rowA * cols;
    const rowB = (idxB / cols) | 0;
    const colB = idxB - rowB * cols;
    const dx = Math.abs(colA - colB);
    const dy = Math.abs(rowA - rowB);
    const min = Math.min(dx, dy);
    const max = Math.max(dx, dy);
    return min * 1.41421356 + (max - min);
}
export function forEachCardinalNeighborIdx(idx, cols, rows, fn) {
    const row = (idx / cols) | 0;
    const col = idx - row * cols;
    if (row > 0) fn(idx - cols);
    if (col < cols - 1) fn(idx + 1);
    if (row < rows - 1) fn(idx + cols);
    if (col > 0) fn(idx - 1);
}
