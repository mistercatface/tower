import { isRailWallEdge } from "./CellEdgeStore.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "./gridNavEpoch.js";
import { railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { neighborFillLevel } from "./gridCellTopology.js";
import { isFloorBeltKind, floorBeltEntryExitSides } from "./FloorCell.js";
import { diagonalStepOpen } from "./vertexPassability.js";
/** @typedef {{ capHeightLevel: number, thicknessLevel?: number }} RailWallBoundarySpec */
/** @typedef {RailWallBoundarySpec} BoundaryPrimarySpec */
export function getBoundary(grid, idx, side) {
    return { primary: isRailWallEdge(grid.edgeStore.getIdx(idx, side)) ? "railWall" : null };
}
export function setBoundary(grid, idx, side, spec, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (spec === null || spec.capHeightLevel === 0) {
        clearBoundaryPrimary(grid, idx, side, bumpRevision);
        return true;
    }
    grid.edgeStore.writeMirrored(idx, side, cols, rows, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, neighborFillLevel(grid, idx, side)));
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
export function clearBoundaryPrimary(grid, idx, side, bumpRevision = false) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (!isRailWallEdge(grid.edgeStore.getIdx(idx, side))) return false;
    grid.edgeStore.clearMirrored(idx, side, cols, rows);
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
