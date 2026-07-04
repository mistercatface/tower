import { isRailWallEdge, railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "./gridNavEpoch.js";
import { neighborFillLevel, edgeMirrorSide } from "./gridCellTopology.js";
import { FloorBelt, gridSideFromCellIdxToNeighborIdx } from "./FloorCell.js";
import { colRowToIndex, forEachCardinalNeighborIdx } from "./GridUtils.js";
export function setBoundary(grid, idx, side, spec, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (spec === null || spec.capHeightLevel === 0) {
        clearBoundaryPrimary(grid, idx, side, bumpRevision);
        return true;
    }
    grid.edgeStore.writeMirrored(idx, side, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, neighborFillLevel(grid, idx, side)));
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
export function clearBoundaryPrimary(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (!isRailWallEdge(grid.edgeStore.getIdx(idx, side))) return false;
    grid.edgeStore.clearMirrored(idx, side);
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
export function clearAllBoundariesAtCell(grid, idx, bumpRevision = false) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryPrimary(grid, idx, side, bumpRevision)) changed = true;
    if (changed && bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return changed;
}
export function boundaryBlocksStep(grid, idx, side) {
    return isRailWallEdge(grid.edgeStore.getIdx(idx, side));
}
function beltBlocksStepFrom(grid, fromIdx, toIdx) {
    const cols = grid.cols;
    const stepSide = gridSideFromCellIdxToNeighborIdx(fromIdx, toIdx, cols);
    const fromBelt = FloorBelt.getEntryExitAtIdx(grid, fromIdx);
    const toBelt = FloorBelt.getEntryExitAtIdx(grid, toIdx);
    if (!fromBelt && !toBelt) return false;
    if (stepSide < 0) return true;
    if (fromBelt && stepSide !== fromBelt.exitSide) return true;
    if (toBelt && edgeMirrorSide(stepSide) === toBelt.exitSide) return true;
    return false;
}
/** Directional step blocking: belt entry rules + rail-wall edges. */
export function boundaryBlocksStepFrom(grid, navCardinalOpen, vertexPassability, fromIdx, toIdx) {
    if (grid.grid[toIdx] !== 0) return true;
    if (beltBlocksStepFrom(grid, fromIdx, toIdx)) return true;
    const cols = grid.cols;
    const diff = toIdx - fromIdx;
    if (diff === 1) return boundaryBlocksStep(grid, fromIdx, 1);
    if (diff === -1) return boundaryBlocksStep(grid, fromIdx, 3);
    if (diff === cols) return boundaryBlocksStep(grid, fromIdx, 2);
    if (diff === -cols) return boundaryBlocksStep(grid, fromIdx, 0);
    if (diff === cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, 1, 1);
    if (diff === cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, -1, 1);
    if (diff === -cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, 1, -1);
    if (diff === -cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, -1, -1);
    return false;
}
export const VERTEX_HALF_EDGE = { NwEast: 1 << 0, NwSouth: 1 << 1, NeWest: 1 << 2, NeSouth: 1 << 3, SwEast: 1 << 4, SwNorth: 1 << 5, SeWest: 1 << 6, SeNorth: 1 << 7 };
const HALF_EDGE_SPECS = [
    { bit: VERTEX_HALF_EDGE.NwEast, ownerCol: -1, ownerRow: -1, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.NwSouth, ownerCol: -1, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.NeWest, ownerCol: 0, ownerRow: -1, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.NeSouth, ownerCol: 0, ownerRow: -1, ownerSide: 2 },
    { bit: VERTEX_HALF_EDGE.SwEast, ownerCol: -1, ownerRow: 0, ownerSide: 1 },
    { bit: VERTEX_HALF_EDGE.SwNorth, ownerCol: -1, ownerRow: 0, ownerSide: 0 },
    { bit: VERTEX_HALF_EDGE.SeWest, ownerCol: 0, ownerRow: 0, ownerSide: 3 },
    { bit: VERTEX_HALF_EDGE.SeNorth, ownerCol: 0, ownerRow: 0, ownerSide: 0 },
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
                const ownerIdx = colRowToIndex(vx + spec.ownerCol, vy + spec.ownerRow, cols);
                if (!boundaryBlocksStep(grid, ownerIdx, spec.ownerSide)) mask |= spec.bit;
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
            forEachCardinalNeighborIdx(idx, cols, rows, (nIdx) => {
                if (!grid.isBlockedIdx(nIdx) && !boundaryBlocksStepFrom(grid, cardinalOpen, vertexPassability, idx, nIdx)) {
                    const diff = nIdx - idx;
                    if (diff === 1) mask |= 1;
                    else if (diff === cols) mask |= 2;
                    else if (diff === -1) mask |= 4;
                    else if (diff === -cols) mask |= 8;
                }
            });
            cardinalOpen[idx] = mask;
        }
}
export function getCardinalBit(dc, dr) {
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
