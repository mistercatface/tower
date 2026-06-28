import { createBeltRailEdge, createForcefieldEdge, EDGE_KIND, edgeBlocksCrossing, isBeltRailEdge, isForcefieldEdge, isRailWallEdge, parsePassageMode } from "./CellEdge.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "./gridNavEpoch.js";
import { resolvePassageStepFrom, resolvePassageStepUndirected } from "./passageStep.js";
import { railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { floorBeltEntryExitSides, floorBeltRailEdgeSides, isFloorBeltKind, isFloorBeltRailsKind } from "./FloorCell.js";
import { neighborFillLevel } from "./gridCellTopology.js";
import { diagonalStepOpen } from "./vertexPassability.js";
/** @typedef {{ kind: "railWall", capHeightLevel: number, thicknessLevel?: number }} RailWallBoundarySpec */
/** @typedef {{ kind: "passage", mode?: string, allowedSide?: number, powered?: boolean }} PassageBoundarySpec */
/** @typedef {RailWallBoundarySpec | PassageBoundarySpec} BoundaryPrimarySpec */
export function getBoundary(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (isRailWallEdge(edge)) return { primary: "railWall", edge, beltRail: false };
    if (isForcefieldEdge(edge)) return { primary: "passage", edge, beltRail: false, mode: parsePassageMode(edge.mode), allowedSide: edge.allowedSide, powered: edge.powered === true };
    if (isBeltRailEdge(edge)) return { primary: null, edge: null, beltRail: true };
    return { primary: null, edge: null, beltRail: false };
}
export function isPassagePowered(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    return isForcefieldEdge(edge) && edge.powered === true;
}
export function setPassagePowered(grid, idx, side, powered) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isForcefieldEdge(edge)) return false;
    edge.powered = powered === true;
    return true;
}
export function setPassageProfile(grid, idx, side, mode, allowedSide) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isForcefieldEdge(edge)) return false;
    return setBoundary(grid, idx, side, { kind: "passage", mode: parsePassageMode(mode), allowedSide: allowedSide ?? side, powered: edge.powered === true }, { bumpRevision: true });
}
/**
 * Sole writer for primary boundary roles (railWall, passage). Derived beltRail uses reconcileBeltBoundaries.
 */
export function setBoundary(grid, idx, side, spec, { bumpRevision = false } = {}) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    if (spec === null) {
        clearBoundaryPrimary(grid, idx, side, { bumpRevision });
        return true;
    }
    if (spec.kind === "railWall") {
        if (spec.capHeightLevel === 0) return setBoundary(grid, idx, side, null, { bumpRevision });
        grid.edgeStore.writeMirrored(idx, side, cols, rows, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, neighborFillLevel(grid, idx, side)));
        if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        return true;
    }
    if (spec.kind === "passage") {
        const edge = grid.edgeStore.getIdx(idx, side);
        if (isRailWallEdge(edge)) return false;
        if (isBeltRailEdge(edge)) return false;
        grid.edgeStore.writeMirrored(idx, side, cols, rows, createForcefieldEdge({ mode: spec.mode, allowedSide: spec.allowedSide ?? side, powered: spec.powered }));
        if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        return true;
    }
    return false;
}
export function clearBoundaryPrimary(grid, idx, side, { bumpRevision = false } = {}) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isRailWallEdge(edge) && !isForcefieldEdge(edge)) return false;
    grid.edgeStore.clearMirrored(idx, side, cols, rows);
    if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return true;
}
/**
 * Clear one boundary slot — primary (railWall, passage) or derived beltRail.
 */
export function clearBoundaryAtSide(grid, idx, side, { bumpRevision = false } = {}) {
    const cols = grid.cols;
    const rows = grid.rows;
    if (idx < 0 || idx >= cols * rows) return false;
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!edge) return false;
    if (isRailWallEdge(edge) || isForcefieldEdge(edge)) return clearBoundaryPrimary(grid, idx, side, { bumpRevision });
    if (isBeltRailEdge(edge)) {
        clearDerivedBeltRail(grid, idx, side);
        if (bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
        return true;
    }
    return false;
}
export function clearAllBoundariesAtCell(grid, idx, { bumpRevision = false } = {}) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryAtSide(grid, idx, side, { bumpRevision: false })) changed = true;
    if (changed && bumpRevision) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    return changed;
}
function writeDerivedBeltRail(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (isRailWallEdge(edge) || isForcefieldEdge(edge) || isBeltRailEdge(edge)) return false;
    const cols = grid.cols;
    const rows = grid.rows;
    grid.edgeStore.writeMirrored(idx, side, cols, rows, createBeltRailEdge());
    return true;
}
function clearDerivedBeltRail(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (!isBeltRailEdge(edge)) return;
    const cols = grid.cols;
    const rows = grid.rows;
    grid.edgeStore.clearMirrored(idx, side, cols, rows);
}
/**
 * Sync lateral beltRail edges after floorStore change. Never overwrites primary boundary.
 */
export function reconcileBeltBoundaries(grid, idx, kind, facingIndex) {
    if (!isFloorBeltRailsKind(kind)) return false;
    const sides = floorBeltRailEdgeSides(kind, facingIndex);
    let changed = false;
    for (let i = 0; i < sides.length; i++) if (writeDerivedBeltRail(grid, idx, sides[i])) changed = true;
    return changed;
}
export function clearBeltBoundariesForCell(grid, idx, kind, facingIndex) {
    const sides = floorBeltRailEdgeSides(kind, facingIndex);
    for (let i = 0; i < sides.length; i++) clearDerivedBeltRail(grid, idx, sides[i]);
}
export function boundaryBlocksStep(grid, idx, side) {
    const edge = grid.edgeStore.getIdx(idx, side);
    if (edgeBlocksCrossing(edge)) return true;
    if (!grid.edgeStore.passageEdgeCount) return false;
    return resolvePassageStepUndirected({ grid, edge, ownerIdx: idx, ownerSide: side, crossedSide: side, fromIdx: idx, toIdx: idx, directional: false });
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
    const edge = grid.edgeStore.getIdx(ownerIdx, ownerSide);
    if (grid.edgeStore.passageEdgeCount > 0 && edge?.kind === EDGE_KIND.Forcefield)
        if (resolvePassageStepFrom({ grid, edge, ownerIdx, ownerSide, crossedSide: ownerSide, fromIdx, toIdx, directional: true })) return true;
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
