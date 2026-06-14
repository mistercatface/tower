import { crossingGrantAllows } from "../../Pathfinding/crossingGrant.js";
import { formatGridSideNeighborLabel, gridSideNeighborCell, gridSideOutwardVector } from "./GridUtils.js";
import { gridWallEdgeMirrorSide, gridWallEdgeNeighbor } from "../../World/wallGridCells.js";
import { PORTAL_ACCESS_MODE } from "./CellEdge.js";
/** Default allowedSide for access one — owner cell (mirror of stamped edge side). */
export function portalAccessDefaultAllowedSide(ownerSide) {
    return gridWallEdgeMirrorSide(ownerSide);
}
/**
 * Cell that may initiate a portal step when access is one.
 * allowedSide === mirror(ownerSide) → owner cell; otherwise neighbor in direction allowedSide.
 */
export function portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return { col: ownerCol, row: ownerRow };
    return gridSideNeighborCell(ownerCol, ownerRow, allowedSide);
}
/** @param {number} ownerSide @param {number} allowedSide */
export function formatPortalAccessSideLabel(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return "Owner cell";
    return formatGridSideNeighborLabel(allowedSide);
}
/** @param {object} edge @param {number} ownerSide */
export function portalMouthAllowedSide(edge, ownerSide) {
    if (edge.accessMode === PORTAL_ACCESS_MODE.Both) return portalAccessDefaultAllowedSide(ownerSide);
    return edge.allowedSide ?? portalAccessDefaultAllowedSide(ownerSide);
}
/**
 * @param {number} ownerCol
 * @param {number} ownerRow
 * @param {number} ownerSide
 * @param {object} edge
 */
export function portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge) {
    const mouth = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    const { nc, nr } = gridWallEdgeNeighbor(ownerCol, ownerRow, ownerSide);
    const back = mouth.col === ownerCol && mouth.row === ownerRow ? { col: nc, row: nr } : { col: ownerCol, row: ownerRow };
    return { mouth, back };
}
/** Whether a portal edge emits physics collision rails. Caller must pass a portal edge. */
export function portalEdgeEmitsCollision(edge) {
    return true;
}
/** World-unit vector for crossing from the allowed initiator cell through the portal edge. */
export function portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, allowedSide) {
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide);
    if (allowed.col === ownerCol && allowed.row === ownerRow) return gridSideOutwardVector(ownerSide);
    return gridSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
}
/** Crossing direction for a portal segment emit owner. */
export function portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide) {
    return portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
}
/**
 * Body center has crossed the portal mid-plane toward the back cell (traverse only — stricter than mouth zone).
 * @param {number} [bodyRadius]
 */
export function portalBodyCrossedEntryPlane(bodyX, bodyY, mouth, back, cross, grid, bodyRadius = 0) {
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const backWorld = grid.gridToWorld(back.col, back.row);
    const midX = (mouthWorld.x + backWorld.x) * 0.5;
    const midY = (mouthWorld.y + backWorld.y) * 0.5;
    // Check alignment along the portal segment to prevent accidental diagonal crossings
    if (cross.x === 0) {
        // Horizontal portal edge: coordinate along edge is X
        if (Math.abs(bodyX - midX) > grid.cellSize * 0.5 + 0.5) return false;
    } else if (Math.abs(bodyY - midY) > grid.cellSize * 0.5 + 0.5)
        // Vertical portal edge: coordinate along edge is Y
        return false;
    const mouthSide = -((bodyX - midX) * cross.x + (bodyY - midY) * cross.y);
    return mouthSide > -bodyRadius * 0.35;
}
/**
 * Mouth-side half-plane test: back cell is never the mouth; center-in-mouth or straddling the plane from the mouth side counts.
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function portalBodyInMouthZone(grid, edge, ownerCol, ownerRow, ownerSide, bodyX, bodyY, bodyRadius) {
    const { mouth, back } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
    const { col, row } = grid.worldToGrid(bodyX, bodyY);
    if (col === back.col && row === back.row) return false;
    if (col === mouth.col && row === mouth.row) return true;
    const cross = portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide);
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const backWorld = grid.gridToWorld(back.col, back.row);
    const midX = (mouthWorld.x + backWorld.x) * 0.5;
    const midY = (mouthWorld.y + backWorld.y) * 0.5;
    const relX = bodyX - midX;
    const relY = bodyY - midY;
    const mouthSide = -(relX * cross.x + relY * cross.y);
    return mouthSide >= -bodyRadius && mouthSide <= grid.cellSize * 0.5 + bodyRadius;
}
/**
 * Directional physics blocking for portal edge rails.
 * @returns {boolean} true when collision should apply
 */
export function portalEdgeBlocksCollision(edge, ownerCol, ownerRow, ownerSide, entity, bodyRadius, vx, vy, dispX, dispY, grid) {
    if (!portalEdgeEmitsCollision(edge)) return false;
    if (edge.powered !== true) return true;
    if (!portalBodyInMouthZone(grid, edge, ownerCol, ownerRow, ownerSide, entity.x, entity.y, bodyRadius)) return true;
    const cross = portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide);
    const { mouth } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
    return !crossingGrantAllows(entity, mouth.col, mouth.row, cross, vx, vy, dispX, dispY);
}
/** World cell at the mouth of the partner portal. */
export function portalTraverseExitCell(grid, partnerCol, partnerRow, partnerSide) {
    const edge = grid.edgeStore.get(partnerCol, partnerRow, partnerSide, grid.cols);
    const { mouth } = portalMouthAndBackCells(partnerCol, partnerRow, partnerSide, edge);
    return mouth;
}
/** Unit vector emerging from the partner portal mouth (back → mouth, out into open space). */
export function portalTraverseExitVector(grid, partnerCol, partnerRow, partnerSide) {
    const edge = grid.edgeStore.get(partnerCol, partnerRow, partnerSide, grid.cols);
    const { mouth, back } = portalMouthAndBackCells(partnerCol, partnerRow, partnerSide, edge);
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const backWorld = grid.gridToWorld(back.col, back.row);
    const dx = mouthWorld.x - backWorld.x;
    const dy = mouthWorld.y - backWorld.y;
    const len = Math.hypot(dx, dy);
    return { x: dx / len, y: dy / len };
}
/** @param {number} fromCol @param {number} fromRow @param {number} toCol @param {number} toRow */
export function resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow) {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc !== 0 && dr === 0) return { ownerCol: fromCol, ownerRow: fromRow, ownerSide: dc > 0 ? 1 : 3 };
    if (dc === 0 && dr !== 0) return { ownerCol: fromCol, ownerRow: fromRow, ownerSide: dr > 0 ? 2 : 0 };
    return null;
}
/** Arrow from edge midpoint toward the allowed initiator cell (access one). */
export function portalAccessArrowVector(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return gridSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
    return gridSideOutwardVector(allowedSide);
}
