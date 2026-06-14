import { gridWallEdgeMirrorSide } from "../../World/wallGridCells.js";
import { parsePortalAccessBlock, PORTAL_ACCESS_BLOCK, PORTAL_ACCESS_MODE } from "./CellEdge.js";
/** Default allowedSide for access one — owner cell (mirror of stamped edge side). */
export function portalAccessDefaultAllowedSide(ownerSide) {
    return gridWallEdgeMirrorSide(ownerSide);
}
export function portalAccessBlockIncludesStep(edge) {
    const block = parsePortalAccessBlock(edge.accessBlock);
    return block === PORTAL_ACCESS_BLOCK.All || block === PORTAL_ACCESS_BLOCK.Step;
}
export function portalAccessBlockIncludesPhysics(edge) {
    const block = parsePortalAccessBlock(edge.accessBlock);
    return block === PORTAL_ACCESS_BLOCK.All || block === PORTAL_ACCESS_BLOCK.Physics;
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
/** @param {string} accessBlock */
export function formatPortalAccessBlockLabel(accessBlock) {
    if (accessBlock === PORTAL_ACCESS_BLOCK.Step) return "Step only";
    if (accessBlock === PORTAL_ACCESS_BLOCK.Physics) return "Physics only";
    return "Step + physics";
}
/** @param {number} ownerSide @param {number} allowedSide */
export function formatPortalAccessSideLabel(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return "Owner cell";
    if (allowedSide === 0) return "North neighbor";
    if (allowedSide === 1) return "East neighbor";
    if (allowedSide === 2) return "South neighbor";
    return "West neighbor";
}
/** Non-directional step query (conservative when access is one). Caller must pass a portal edge. */
export function portalBlocksStepWithoutDirection(edge, ownerSide) {
    if (edge.powered !== true) return true;
    if (edge.accessMode === PORTAL_ACCESS_MODE.Both) return false;
    return portalAccessBlockIncludesStep(edge);
}
/**
 * Portal step blocking for access sides. Part 3 calls this before traverse.
 * @returns {boolean} true when the step is blocked
 */
export function portalBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide) {
    if (edge.powered !== true) return true;
    if (edge.accessMode === PORTAL_ACCESS_MODE.Both) return false;
    if (!portalAccessBlockIncludesStep(edge)) return false;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, edge.allowedSide);
    return fromCol !== allowed.col || fromRow !== allowed.row;
}
/** Whether a portal edge emits physics collision rails. Caller must pass a portal edge. */
export function portalEdgeEmitsCollision(edge) {
    if (edge.powered !== true) return true;
    if (edge.accessMode === PORTAL_ACCESS_MODE.Both) return false;
    return portalAccessBlockIncludesPhysics(edge);
}
/** World-unit vector for crossing from the allowed initiator cell through the portal edge. */
export function portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, allowedSide) {
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide);
    if (allowed.col === ownerCol && allowed.row === ownerRow) return portalSideOutwardVector(ownerSide);
    return portalSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
}
/**
 * Directional physics blocking for portal edge rails.
 * @returns {boolean} true when collision should apply
 */
export function portalEdgeBlocksCollision(edge, ownerCol, ownerRow, ownerSide, bodyX, bodyY, vx, vy, grid) {
    if (!portalEdgeEmitsCollision(edge)) return false;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, edge.allowedSide);
    const { col: bodyCol, row: bodyRow } = grid.worldToGrid(bodyX, bodyY);
    if (bodyCol !== allowed.col || bodyRow !== allowed.row) return true;
    const cross = portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, edge.allowedSide);
    return vx * cross.x + vy * cross.y <= 0.5;
}
/** World cell beyond partner portal, preserving entry step direction. */
export function portalTraverseExitCell(partnerCol, partnerRow, fromCol, fromRow, toCol, toRow) {
    return { col: partnerCol + (toCol - fromCol), row: partnerRow + (toRow - fromRow) };
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
