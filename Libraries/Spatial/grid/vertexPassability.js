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
                const fromIdx = colRowToIndex(fromCol, fromRow, cols);
                const toIdx = colRowToIndex(toCol, toRow, cols);
                const ownerIdx = colRowToIndex(ownerCol, ownerRow, cols);
                if (!boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, ownerIdx, spec.ownerSide)) mask |= spec.bit;
            }
            vertexPassability[packVertexKey(vx, vy, cols)] = mask;
        }
}
const DIAG_1_1 = [VERTEX_HALF_EDGE.NwEast, VERTEX_HALF_EDGE.NwSouth, VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.NeSouth];
const DIAG_N1_N1 = [VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.SeNorth, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeWest];
const DIAG_1_N1 = [VERTEX_HALF_EDGE.SwEast, VERTEX_HALF_EDGE.SwNorth, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.NwEast];
const DIAG_N1_1 = [VERTEX_HALF_EDGE.NeWest, VERTEX_HALF_EDGE.NeSouth, VERTEX_HALF_EDGE.SeWest, VERTEX_HALF_EDGE.NwSouth];
export function recomputeNavCardinalOpenInto(grid, cardinalOpen, vertexPassability, bounds = null) {
    const { cols, rows } = grid;
    const c0 = bounds ? bounds.startCol : 0;
    const c1 = bounds ? bounds.endCol : cols - 1;
    const r0 = bounds ? bounds.startRow : 0;
    const r1 = bounds ? bounds.endRow : rows - 1;
    for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
            const idx = colRowToIndex(col, row, cols);
            if (grid.isBlockedIdx(idx)) {
                cardinalOpen[idx] = 0;
                continue;
            }
            let mask = 0;
            // East
            if (col < cols - 1) {
                const nIdx = idx + 1;
                if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) mask |= 1;
            }
            // South
            if (row < rows - 1) {
                const nIdx = idx + cols;
                if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) mask |= 2;
            }
            // West
            if (col > 0) {
                const nIdx = idx - 1;
                if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) mask |= 4;
            }
            // North
            if (row > 0) {
                const nIdx = idx - cols;
                if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) mask |= 8;
            }
            cardinalOpen[idx] = mask;
        }
}
function getCardinalBit(dc, dr) {
    if (dc === 1) return 1;
    if (dr === 1) return 2;
    if (dc === -1) return 4;
    return 8;
}
function cardinalLegOpen(cardinalOpen, cols, col, row, dc, dr) {
    return (cardinalOpen[colRowToIndex(col, row, cols)] & getCardinalBit(dc, dr)) !== 0;
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
export function diagonalStepOpen(cardinalOpen, vertexPassability, cols, rows, fromIdx, dc, dr) {
    const col = fromIdx % cols;
    const row = (fromIdx / cols) | 0;
    if (!diagonalCardinalLegsOpen(cardinalOpen, cols, col, row, dc, dr)) return false;
    const cvx = dc > 0 ? col + dc : col;
    const cvy = dr > 0 ? row + dr : row;
    const mask = vertexPassability[packVertexKey(cvx, cvy, cols)] ?? 0;
    let need;
    if (dc === 1) need = dr === 1 ? DIAG_1_1 : DIAG_1_N1;
    else need = dr === 1 ? DIAG_N1_1 : DIAG_N1_N1;
    for (let i = 0; i < need.length; i++) if ((mask & need[i]) === 0) return false;
    return true;
}
