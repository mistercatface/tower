import { EDGE_KIND, edgeBlocksCrossing, isRailWallEdge } from "./CellEdgeStore.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "./gridNavEpoch.js";
import { railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { neighborFillLevel } from "./gridCellTopology.js";
import { isFloorBeltKind, floorBeltEntryExitSides } from "./FloorCell.js";
import { diagonalStepOpen } from "./vertexPassability.js";
/** @typedef {{ kind: "railWall", capHeightLevel: number, thicknessLevel?: number }} RailWallBoundarySpec */
/** @typedef {RailWallBoundarySpec} BoundaryPrimarySpec */
export function getBoundary(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (isRailWallEdge(edge)) return { primary: "railWall", edge, beltRail: false };
    return { primary: null, edge: null, beltRail: false };
}
/**
 * Sole writer for primary boundary roles (railWall). Derived beltRail uses reconcileBeltBoundaries.
 */
export function setBoundary(grid, idx, side, spec, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (spec === null) {
        clearBoundaryPrimary(grid, idx, side, bumpRevision);
        return true;
    }
    if (spec.kind === "railWall") {
        if (spec.capHeightLevel === 0) return setBoundary(grid, idx, side, null, bumpRevision);
        grid.edgeStore.writeMirrored(idx, side, cols, rows, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, neighborFillLevel(grid, idx, side)));
        if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        return true;
    }
    return false;
}
export function clearBoundaryPrimary(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isRailWallEdge(edge)) return false;
    grid.edgeStore.clearMirrored(idx, side, cols, rows);
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
/**
 * Clear one boundary slot — primary (railWall, passage) or derived beltRail.
 */
export function clearBoundaryAtSide(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!edge) return false;
    if (isRailWallEdge(edge)) return clearBoundaryPrimary(grid, idx, side, bumpRevision);
    return false;
}
export function clearAllBoundariesAtCell(grid, idx, bumpRevision = false) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryAtSide(grid, idx, side, bumpRevision)) changed = true;
    if (changed && bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return changed;
}
export function boundaryBlocksStep(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    return edgeBlocksCrossing(edge);
}
function cardinalStepSide(cols, fromIdx, toIdx) {
    const diff = toIdx - fromIdx;
    if (diff === 1) return 1;
    if (diff === -1) return 3;
    if (diff === cols) return 2;
    if (diff === -cols) return 0;
    return -1;
}
function oppositeSide(side) {
    return side < 0 ? -1 : (side + 2) % 4;
}
function beltEntryExitAt(grid, idx) {
    const kind = grid.floorStore.kind[idx];
    if (!isFloorBeltKind(kind)) return null;
    return floorBeltEntryExitSides(kind, grid.floorStore.facing[idx]);
}
function beltBlocksStepFrom(grid, fromIdx, toIdx) {
    const cols = grid.cols;
    const stepSide = cardinalStepSide(cols, fromIdx, toIdx);
    const fromBelt = beltEntryExitAt(grid, fromIdx);
    const toBelt = beltEntryExitAt(grid, toIdx);
    if (!fromBelt && !toBelt) return false;
    if (stepSide < 0) return true;
    if (fromBelt && stepSide !== fromBelt.exitSide) return true;
    if (toBelt && oppositeSide(stepSide) === toBelt.exitSide) return true;
    return false;
}
export function boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, ownerIdx, ownerSide) {
    return boundaryBlocksStep(grid, ownerIdx, ownerSide);
}
/**
 * Directional step blocking: belt entry rules + boundary edges (rail, beltRail, powered passage).
 */
export function boundaryBlocksStepFrom(grid, navCardinalOpen, vertexPassability, fromIdx, toIdx) {
    if (grid.grid[toIdx] !== 0) return true;
    if (beltBlocksStepFrom(grid, fromIdx, toIdx)) return true;
    const cols = grid.cols;
    const diff = toIdx - fromIdx;
    if (diff === 1) return boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, fromIdx, 1);
    if (diff === -1) return boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, fromIdx, 3);
    if (diff === cols) return boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, fromIdx, 2);
    if (diff === -cols) return boundaryDirectedCrossingBlocked(grid, fromIdx, toIdx, fromIdx, 0);
    if (diff === cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, 1, 1);
    if (diff === cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, -1, 1);
    if (diff === -cols + 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, 1, -1);
    if (diff === -cols - 1) return !diagonalStepOpen(navCardinalOpen, vertexPassability, cols, grid.rows, fromIdx, -1, -1);
    return false;
}
