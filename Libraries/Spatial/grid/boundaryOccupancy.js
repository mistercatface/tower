import {
    createBeltRailEdge,
    createForcefieldEdge,
    createPortalEdge,
    edgeBlocksCrossing,
    isBeltRailEdge,
    isForcefieldEdge,
    isPortalEdge,
    isRailWallEdge,
    parsePassageMode,
    parsePortalAccessBlock,
    parsePortalAccessMode,
    PORTAL_ACCESS_MODE,
} from "./CellEdge.js";
import { portalAccessDefaultAllowedSide } from "./portalAccess.js";
import { resolvePassageStepFrom, resolvePassageStepUndirected } from "./passageStep.js";
import { railWallEdgeFromStamp } from "./CellEdgeStore.js";
import { floorBeltEntryExitSides, floorBeltRailEdgeSides, isFloorBeltRailsKind } from "./FloorCell.js";
import { cellInRect, colRowToIndex } from "./GridUtils.js";
import { gridNeighborFillLevel } from "../../World/wallGridCells.js";
/** @typedef {{ kind: "railWall", capHeightLevel: number, thicknessLevel?: number }} RailWallBoundarySpec */
/** @typedef {{ kind: "passage", mode?: string, allowedSide?: number, powered?: boolean }} PassageBoundarySpec */
/** @typedef {{ kind: "portal", accessMode?: string, allowedSide?: number, accessBlock?: string, partnerKey?: number, linkMode?: string, linkSourceKey?: number, powered?: boolean }} PortalBoundarySpec */
/** @typedef {RailWallBoundarySpec | PassageBoundarySpec | PortalBoundarySpec} BoundaryPrimarySpec */
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 */
export function getBoundary(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (isRailWallEdge(edge)) return { primary: "railWall", edge, beltRail: false };
    if (isPortalEdge(edge))
        return {
            primary: "portal",
            edge,
            beltRail: false,
            accessMode: parsePortalAccessMode(edge.accessMode),
            accessBlock: parsePortalAccessBlock(edge.accessBlock),
            allowedSide: edge.allowedSide,
            partnerKey: edge.partnerKey ?? 0,
            linkMode: edge.linkMode ?? "shared",
            linkSourceKey: edge.linkSourceKey ?? 0,
            powered: edge.powered === true,
        };
    if (isForcefieldEdge(edge)) return { primary: "passage", edge, beltRail: false, mode: parsePassageMode(edge.mode), allowedSide: edge.allowedSide, powered: edge.powered === true };
    if (isBeltRailEdge(edge)) return { primary: null, edge: null, beltRail: true };
    return { primary: null, edge: null, beltRail: false };
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function isPassagePowered(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    return isForcefieldEdge(edge) && edge.powered === true;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side @param {boolean} powered */
export function setPassagePowered(grid, col, row, side, powered) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isForcefieldEdge(edge)) return false;
    edge.powered = powered === true;
    return true;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side @param {string} mode @param {number} [allowedSide] */
export function setPassageProfile(grid, col, row, side, mode, allowedSide) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isForcefieldEdge(edge) || isPortalEdge(edge)) return false;
    return setBoundary(grid, col, row, side, { kind: "passage", mode: parsePassageMode(mode), allowedSide: allowedSide ?? side, powered: edge.powered === true }, { bumpRevision: true });
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side @param {string} accessMode @param {number} [allowedSide] @param {string} [accessBlock] */
export function setPortalProfile(grid, col, row, side, accessMode, allowedSide, accessBlock) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isPortalEdge(edge)) return false;
    const ownerSide = side;
    return setBoundary(
        grid,
        col,
        row,
        side,
        {
            kind: "portal",
            accessMode: PORTAL_ACCESS_MODE.One,
            allowedSide: allowedSide ?? portalAccessDefaultAllowedSide(ownerSide),
            accessBlock: parsePortalAccessBlock(accessBlock ?? edge.accessBlock),
            partnerKey: edge.partnerKey ?? 0,
            linkMode: edge.linkMode ?? "shared",
            linkSourceKey: edge.linkSourceKey ?? 0,
            powered: edge.powered === true,
        },
        { bumpRevision: true },
    );
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
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
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
        grid.edgeStore.writeMirrored(col, row, side, grid.cols, grid.rows, createForcefieldEdge({ mode: spec.mode, allowedSide: spec.allowedSide ?? side, powered: spec.powered }));
        if (bumpRevision) grid.bumpWallGridRevision();
        return true;
    }
    if (spec.kind === "portal") {
        const edge = grid.edgeStore.get(col, row, side, grid.cols);
        if (isRailWallEdge(edge)) return false;
        if (isBeltRailEdge(edge)) return false;
        grid.edgeStore.writeMirrored(
            col,
            row,
            side,
            grid.cols,
            grid.rows,
            createPortalEdge({
                accessMode: spec.accessMode,
                allowedSide: spec.allowedSide ?? side,
                accessBlock: spec.accessBlock,
                partnerKey: spec.partnerKey ?? 0,
                linkMode: spec.linkMode,
                linkSourceKey: spec.linkSourceKey,
                powered: spec.powered,
            }),
        );
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
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge) && !isForcefieldEdge(edge)) return false;
    grid.edgeStore.clearMirrored(col, row, side, grid.cols, grid.rows);
    if (bumpRevision) grid.bumpWallGridRevision();
    return true;
}
/**
 * Clear one boundary slot — primary (railWall, passage) or derived beltRail.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {{ bumpRevision?: boolean }} [opts]
 * @returns {boolean}
 */
export function clearBoundaryAtSide(grid, col, row, side, { bumpRevision = false } = {}) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!edge) return false;
    if (isRailWallEdge(edge) || isForcefieldEdge(edge)) return clearBoundaryPrimary(grid, col, row, side, { bumpRevision });
    if (isBeltRailEdge(edge)) {
        clearDerivedBeltRail(grid, col, row, side);
        if (bumpRevision) grid.bumpWallGridRevision();
        return true;
    }
    return false;
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {{ bumpRevision?: boolean }} [opts]
 * @returns {boolean}
 */
export function clearAllBoundariesAtCell(grid, col, row, { bumpRevision = false } = {}) {
    let changed = false;
    for (let side = 0; side < 4; side++) if (clearBoundaryAtSide(grid, col, row, side, { bumpRevision: false })) changed = true;
    if (changed && bumpRevision) grid.bumpWallGridRevision();
    return changed;
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
 */
export function boundaryBlocksStep(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (edgeBlocksCrossing(edge)) return true;
    return resolvePassageStepUndirected({ grid, edge, ownerCol: col, ownerRow: row, ownerSide: side, crossedSide: side, fromCol: col, fromRow: row, toCol: col, toRow: row, directional: false });
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
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} fromCol @param {number} fromRow @param {number} toCol @param {number} toRow @param {number} ownerCol @param {number} ownerRow @param {number} ownerSide */
function boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, ownerCol, ownerRow, ownerSide) {
    const edge = grid.edgeStore.get(ownerCol, ownerRow, ownerSide, grid.cols);
    if (resolvePassageStepFrom({ grid, edge, ownerCol, ownerRow, ownerSide, crossedSide: ownerSide, fromCol, fromRow, toCol, toRow, directional: true })) return true;
    return boundaryBlocksStep(grid, ownerCol, ownerRow, ownerSide);
}
/**
 * Directional step blocking: belt entry rules + boundary edges (rail, beltRail, powered passage).
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} fromCol
 * @param {number} fromRow
 * @param {number} toCol
 * @param {number} toRow
 */
export function boundaryBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow) {
    if (grid.isBlocked(toCol, toRow)) return true;
    if (beltBlocksEntryFrom(grid, fromCol, fromRow, toCol, toRow)) return true;
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc !== 0 && dr === 0) {
        const side = dc > 0 ? 1 : 3;
        return boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, side);
    }
    if (dc === 0 && dr !== 0) {
        const side = dr > 0 ? 2 : 0;
        return boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, side);
    }
    if (dc !== 0 && dr !== 0) {
        if (grid.isBlocked(fromCol + dc, fromRow) || grid.isBlocked(fromCol, fromRow + dr)) return true;
        const sideX = dc > 0 ? 1 : 3;
        const sideY = dr > 0 ? 2 : 0;
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, sideX)) return true;
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow, sideY)) return true;
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow + dr, sideX)) return true;
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol + dc, fromRow, sideY)) return true;
        // Shoulder cells share the corner vertex — both axes must be clear (L-shaped forcefields).
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol + dc, fromRow, sideX)) return true;
        if (boundaryBlocksStepOnEdge(grid, fromCol, fromRow, toCol, toRow, fromCol, fromRow + dr, sideY)) return true;
    }
    return false;
}
