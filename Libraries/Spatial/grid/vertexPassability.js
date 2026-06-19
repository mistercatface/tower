import { cellInRect, colRowToIndex } from "./GridUtils.js";
import { boundaryDirectedCrossingBlocked, boundaryBlocksStepFrom } from "./boundaryOccupancy.js";
export const VERTEX_HALF_EDGE = { NwEast: 1 << 0, NwSouth: 1 << 1, NeWest: 1 << 2, NeSouth: 1 << 3, SwEast: 1 << 4, SwNorth: 1 << 5, SeWest: 1 << 6, SeNorth: 1 << 7 };
const HALF_EDGE_SPECS = [
    { bit: VERTEX_HALF_EDGE.NwEast, fromCol: -1, fromRow: -1, toCol: 0, toRow: -1, ownerCol: -1, ownerRow: -1, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.NwSouth, fromCol: -1, fromRow: -1, toCol: -1, toRow: 0, ownerCol: -1, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.NeWest, fromCol: 0, fromRow: -1, toCol: -1, toRow: -1, ownerCol: 0, ownerRow: -1, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.NeSouth, fromCol: 0, fromRow: -1, toCol: 0, toRow: 0, ownerCol: 0, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.SwEast, fromCol: -1, fromRow: 0, toCol: 0, toRow: 0, ownerCol: -1, ownerRow: 0, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.SwNorth, fromCol: -1, fromRow: 0, toCol: -1, toRow: -1, ownerCol: -1, ownerRow: 0, ownerSide: 0 },
    { bit: VERTEX_HALF_EDGE.SeWest, fromCol: 0, fromRow: 0, toCol: -1, toRow: 0, ownerCol: 0, ownerRow: 0, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.SeNorth, fromCol: 0, fromRow: 0, toCol: 0, toRow: -1, ownerCol: 0, ownerRow: 0, ownerSide: 0 },
];
export function packVertexKey(vx, vy, cols) {
    return vx + vy * (cols + 1);
}
export function recomputeVertexPassabilityInto(grid, vertexPassability, bounds = null) {
    if (!grid.cols) return;
    const { cols, rows } = grid;
    const vx0 = bounds ? Math.max(0, bounds.startCol) : 0;
    const vx1 = bounds ? Math.min(cols, bounds.endCol + 1) : cols;
    const vy0 = bounds ? Math.max(0, bounds.startRow) : 0;
    const vy1 = bounds ? Math.min(rows, bounds.endRow + 1) : rows;
    for (let vy = vy0; vy <= vy1; vy++)
        for (let vx = vx0; vx <= vx1; vx++) {
            let mask = 0;
            for (let i = 0; i < HALF_EDGE_SPECS.length; i++) {
                const spec = HALF_EDGE_SPECS[i];
                const fromCol = vx + spec.fromCol;
                const fromRow = vy + spec.fromRow;
                const toCol = vx + spec.toCol;
                const toRow = vy + spec.toRow;
                const ownerCol = vx + spec.ownerCol;
                const ownerRow = vy + spec.ownerRow;
                if (!cellInRect(fromCol, fromRow, cols, rows) || !cellInRect(toCol, toRow, cols, rows)) continue;
                if (!boundaryDirectedCrossingBlocked(grid, fromCol, fromRow, toCol, toRow, ownerCol, ownerRow, spec.ownerSide)) mask |= spec.bit;
            }
            vertexPassability[packVertexKey(vx, vy, cols)] = mask;
        }
}
const CARDINAL_BITS = { "1,0": 1, "0,1": 2, "-1,0": 4, "0,-1": 8 };
const DIAGONAL_VERTEX_BITS = {
    "1,1": [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth],
    "-1,-1": [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest],
    "1,-1": [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast],
    "-1,1": [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth],
};
export function recomputeNavCardinalOpenInto(grid, cardinalOpen, vertexPassability, bounds = null) {
    const { cols, rows } = grid;
    const c0 = bounds ? bounds.startCol : 0;
    const c1 = bounds ? bounds.endCol : cols - 1;
    const r0 = bounds ? bounds.startRow : 0;
    const r1 = bounds ? bounds.endRow : rows - 1;
    for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (grid.isBlocked(col, row)) {
                cardinalOpen[idx] = 0;
                continue;
            }
            let mask = 0;
            for (const key in CARDINAL_BITS) {
                const [dc, dr] = key.split(",").map(Number);
                const nc = col + dc;
                const nr = row + dr;
                if (!cellInRect(nc, nr, cols, rows)) continue;
                if (!grid.isBlocked(nc, nr) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, col, row, nc, nr)) mask |= CARDINAL_BITS[key];
            }
            cardinalOpen[idx] = mask;
        }
}
function cardinalLegOpen(cardinalOpen, cols, col, row, dc, dr) {
    return (cardinalOpen[colRowToIndex(col, row, cols)] & CARDINAL_BITS[`${dc},${dr}`]) !== 0;
}
function diagonalCardinalLegsOpen(cardinalOpen, cols, col, row, dc, dr) {
    const shoulderHCol = col + dc;
    const shoulderHRow = row;
    const shoulderVCol = col;
    const shoulderVRow = row + dr;
    return (
        cardinalLegOpen(cardinalOpen, cols, col, row, dc, 0) &&
        cardinalLegOpen(cardinalOpen, cols, col, row, 0, dr) &&
        cardinalLegOpen(cardinalOpen, cols, shoulderHCol, shoulderHRow, 0, dr) &&
        cardinalLegOpen(cardinalOpen, cols, shoulderVCol, shoulderVRow, dc, 0)
    );
}
export function diagonalStepOpen(cardinalOpen, vertexPassability, cols, rows, col, row, dc, dr) {
    if (!diagonalCardinalLegsOpen(cardinalOpen, cols, col, row, dc, dr)) return false;
    const cvx = dc > 0 ? col + dc : col;
    const cvy = dr > 0 ? row + dr : row;
    const mask = vertexPassability[packVertexKey(cvx, cvy, cols)] ?? 0;
    const need = DIAGONAL_VERTEX_BITS[`${dc},${dr}`];
    if (!need) return false;
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return false;
    return true;
}
