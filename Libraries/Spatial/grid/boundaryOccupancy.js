import { createBeltRailEdge, createForcefieldEdge, edgeBlocksCrossing, isBeltRailEdge, isForcefieldEdge, isRailWallEdge } from "./CellEdge.js";
import { railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { floorBeltEntryExitSides, floorBeltRailEdgeSides, isFloorBeltRailsKind } from "./FloorCell.js";
import { colRowToIndex } from "./GridUtils.js";
import { gridNeighborFillLevel } from "../../World/wallGridCells.js";
/** @typedef {{ kind: "railWall", capHeightLevel: number, thicknessLevel?: number }} RailWallBoundarySpec */
/** @typedef {{ kind: "passage" }} PassageBoundarySpec */
/** @typedef {RailWallBoundarySpec | PassageBoundarySpec} BoundaryPrimarySpec */
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 */
export function getBoundary(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (isRailWallEdge(edge)) return { primary: "railWall", edge, beltRail: false };
    if (isForcefieldEdge(edge)) return { primary: "passage", edge, beltRail: false };
    if (isBeltRailEdge(edge)) return { primary: null, edge: null, beltRail: true };
    return { primary: null, edge: null, beltRail: false };
}
/**
 * Sole writer for primary boundary roles (railWall, passage). Derived beltRail uses reconcileBeltBoundaries.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {BoundaryPrimarySpec | null} spec — null clears primary only (preserves derived beltRail)
 * @param {{ bumpRevision?: boolean }} [opts]
 * @returns {boolean} false when exclusivity rejects the write
 */
export function setBoundary(grid, col, row, side, spec, { bumpRevision = false } = {}) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    if (spec === null) {
        clearBoundaryPrimary(grid, col, row, side, { bumpRevision });
        return true;
    }
    if (spec.kind === "railWall") {
        if (spec.capHeightLevel === 0) return setBoundary(grid, col, row, side, null, { bumpRevision });
        grid.edgeStore.writeMirrored(col, row, side, grid.cols, grid.rows, railWallEdgeFromStamp(spec.capHeightLevel, spec.thicknessLevel ?? 1, gridNeighborFillLevel(grid, col, row, side)));
        if (bumpRevision) grid.bumpWallGridRevision();
        return true;
    }
    if (spec.kind === "passage") {
        const edge = grid.edgeStore.get(col, row, side, grid.cols);
        if (isRailWallEdge(edge)) return false;
        if (isBeltRailEdge(edge)) return false;
        grid.edgeStore.writeMirrored(col, row, side, grid.cols, grid.rows, createForcefieldEdge());
        if (bumpRevision) grid.bumpWallGridRevision();
        return true;
    }
    return false;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {{ bumpRevision?: boolean }} [opts]
 * @returns {boolean} true when a primary edge was cleared
 */
export function clearBoundaryPrimary(grid, col, row, side, { bumpRevision = false } = {}) {
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge) && !isForcefieldEdge(edge)) return false;
    grid.edgeStore.clearMirrored(col, row, side, grid.cols, grid.rows);
    if (bumpRevision) grid.bumpWallGridRevision();
    return true;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 */
function writeDerivedBeltRail(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (isRailWallEdge(edge) || isForcefieldEdge(edge) || isBeltRailEdge(edge)) return false;
    grid.edgeStore.writeMirrored(col, row, side, grid.cols, grid.rows, createBeltRailEdge());
    return true;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 */
function clearDerivedBeltRail(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isBeltRailEdge(edge)) return;
    grid.edgeStore.clearMirrored(col, row, side, grid.cols, grid.rows);
}
/**
 * Sync lateral beltRail edges after floorStore change. Never overwrites primary boundary.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} kind
 * @param {number} facingIndex
 * @returns {boolean} true when any derived edge was written
 */
export function reconcileBeltBoundaries(grid, col, row, kind, facingIndex) {
    if (!isFloorBeltRailsKind(kind)) return false;
    const sides = floorBeltRailEdgeSides(kind, facingIndex);
    let changed = false;
    for (let i = 0; i < sides.length; i++) if (writeDerivedBeltRail(grid, col, row, sides[i])) changed = true;
    return changed;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} kind
 * @param {number} facingIndex
 */
export function clearBeltBoundariesForCell(grid, col, row, kind, facingIndex) {
    const sides = floorBeltRailEdgeSides(kind, facingIndex);
    for (let i = 0; i < sides.length; i++) clearDerivedBeltRail(grid, col, row, sides[i]);
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {((col: number, row: number, side: number) => boolean) | null | undefined} isPassageBlocking
 */
export function boundaryBlocksStep(grid, col, row, side, isPassageBlocking) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (edgeBlocksCrossing(edge)) return true;
    return isForcefieldEdge(edge) && isPassageBlocking?.(col, row, side) === true;
}
/** @param {number} fromCol @param {number} fromRow @param {number} toCol @param {number} toRow */
function beltCrossedSideFrom(fromCol, fromRow, toCol, toRow) {
    const dc = fromCol - toCol;
    const dr = fromRow - toRow;
    if (dc === -1) return 3;
    if (dc === 1) return 1;
    if (dr === -1) return 0;
    if (dr === 1) return 2;
    return -1;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} toCol @param {number} toRow @param {number} fromCol @param {number} fromRow */
function beltBlocksEntryFrom(grid, fromCol, fromRow, toCol, toRow) {
    const idx = colRowToIndex(toCol, toRow, grid.cols);
    if (!grid.floorStore.isBeltKindAtIdx(idx)) return false;
    const kind = grid.floorStore.kind[idx];
    const { exitSide } = floorBeltEntryExitSides(kind, grid.floorStore.facing[idx]);
    const dc = fromCol - toCol;
    const dr = fromRow - toRow;
    if (dc === 0 && dr === 0) return false;
    const crossed = beltCrossedSideFrom(fromCol, fromRow, toCol, toRow);
    if (crossed >= 0) return crossed === exitSide;
    const sideX = dc > 0 ? 1 : 3;
    const sideY = dr > 0 ? 2 : 0;
    return sideX === exitSide || sideY === exitSide;
}
/**
 * Directional step blocking: belt entry rules + boundary edges (rail, beltRail, powered passage).
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} fromCol
 * @param {number} fromRow
 * @param {number} toCol
 * @param {number} toRow
 * @param {((col: number, row: number, side: number) => boolean) | null | undefined} isPassageBlocking
 */
export function boundaryBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow, isPassageBlocking) {
    if (grid.isBlocked(toCol, toRow)) return true;
    if (beltBlocksEntryFrom(grid, fromCol, fromRow, toCol, toRow)) return true;
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc !== 0 && dr === 0) {
        const side = dc > 0 ? 1 : 3;
        return boundaryBlocksStep(grid, fromCol, fromRow, side, isPassageBlocking);
    }
    if (dc === 0 && dr !== 0) {
        const side = dr > 0 ? 2 : 0;
        return boundaryBlocksStep(grid, fromCol, fromRow, side, isPassageBlocking);
    }
    if (dc !== 0 && dr !== 0) {
        if (grid.isBlocked(fromCol + dc, fromRow) || grid.isBlocked(fromCol, fromRow + dr)) return true;
        const sideX = dc > 0 ? 1 : 3;
        const sideY = dr > 0 ? 2 : 0;
        if (boundaryBlocksStep(grid, fromCol, fromRow, sideX, isPassageBlocking)) return true;
        if (boundaryBlocksStep(grid, fromCol, fromRow, sideY, isPassageBlocking)) return true;
        const oppSideX = dc > 0 ? 3 : 1;
        const oppSideY = dr > 0 ? 0 : 2;
        if (boundaryBlocksStep(grid, toCol, toRow, oppSideX, isPassageBlocking)) return true;
        if (boundaryBlocksStep(grid, toCol, toRow, oppSideY, isPassageBlocking)) return true;
    }
    return false;
}
