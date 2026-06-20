export function colRowToIndex(col, row, cols) {
    return row * cols + col;
}
/** Stable string key for Set/Map lookups over grid cells. */
export function gridCellKey(col, row) {
    return `${col},${row}`;
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
