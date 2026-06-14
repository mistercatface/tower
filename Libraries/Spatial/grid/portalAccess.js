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
    if (allowedSide === 0) return { col: ownerCol, row: ownerRow - 1 };
    if (allowedSide === 1) return { col: ownerCol + 1, row: ownerRow };
    if (allowedSide === 2) return { col: ownerCol, row: ownerRow + 1 };
    return { col: ownerCol - 1, row: ownerRow };
}
/** @param {number} ownerSide @param {number} allowedSide */
export function formatPortalAccessSideLabel(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return "Owner cell";
    if (allowedSide === 0) return "North neighbor";
    if (allowedSide === 1) return "East neighbor";
    if (allowedSide === 2) return "South neighbor";
    return "West neighbor";
}
/** Non-directional step query. Caller must pass a portal edge. Portals never allow normal adjacency walks. */
export function portalBlocksStepWithoutDirection(edge, ownerSide) {
    return true;
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
/**
 * Portal step blocking — mouth cell only when powered; solid both sides when unpowered.
 * @returns {boolean} true when the step is blocked
 */
export function portalBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide) {
    if (edge.powered !== true) return true;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    return fromCol !== allowed.col || fromRow !== allowed.row;
}
/** Whether a portal edge emits physics collision rails. Caller must pass a portal edge. */
export function portalEdgeEmitsCollision(edge) {
    return true;
}
/** World-unit vector for crossing from the allowed initiator cell through the portal edge. */
export function portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, allowedSide) {
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide);
    if (allowed.col === ownerCol && allowed.row === ownerRow) return portalSideOutwardVector(ownerSide);
    return portalSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
}
/** Crossing direction for a portal segment emit owner. */
export function portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide) {
    return portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
}
const PORTAL_CROSSING_INTENT_EPS = 0.05;
/** @param {{ x: number, y: number }} cross @param {number} vx @param {number} vy @param {number} dispX @param {number} dispY */
export function portalHasCrossingIntent(cross, vx, vy, dispX, dispY) {
    if (vx * cross.x + vy * cross.y > PORTAL_CROSSING_INTENT_EPS) return true;
    return dispX * cross.x + dispY * cross.y > PORTAL_CROSSING_INTENT_EPS;
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
export function portalEdgeBlocksCollision(edge, ownerCol, ownerRow, ownerSide, bodyX, bodyY, bodyRadius, vx, vy, dispX, dispY, grid) {
    if (!portalEdgeEmitsCollision(edge)) return false;
    if (edge.powered !== true) return true;
    if (!portalBodyInMouthZone(grid, edge, ownerCol, ownerRow, ownerSide, bodyX, bodyY, bodyRadius)) return true;
    const cross = portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide);
    return !portalHasCrossingIntent(cross, vx, vy, dispX, dispY);
}
/** World cell at the mouth of the partner portal. */
export function portalTraverseExitCell(grid, partnerCol, partnerRow, partnerSide) {
    const edge = grid.edgeStore.get(partnerCol, partnerRow, partnerSide, grid.cols);
    const { mouth } = portalMouthAndBackCells(partnerCol, partnerRow, partnerSide, edge);
    return mouth;
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
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return portalSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
    return portalSideOutwardVector(allowedSide);
}
/** @param {number} side */
function portalSideOutwardVector(side) {
    if (side === 0) return { x: 0, y: -1 };
    if (side === 1) return { x: 1, y: 0 };
    if (side === 2) return { x: 0, y: 1 };
    return { x: -1, y: 0 };
}
