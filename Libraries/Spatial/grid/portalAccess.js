import { gridWallEdgeMirrorSide } from "../../World/wallGridCells.js";
import { isPortalEdge, PORTAL_ACCESS_MODE, parsePortalAccessMode } from "./CellEdge.js";
/** Default allowedSide for access one — owner cell (mirror of stamped edge side). */
export function portalAccessDefaultAllowedSide(ownerSide) {
    return gridWallEdgeMirrorSide(ownerSide);
}
/**
 * Cell that may initiate a portal step when access is one.
 * allowedSide === mirror(ownerSide) → owner cell; otherwise neighbor in direction allowedSide.
 *
 * @param {number} ownerCol
 * @param {number} ownerRow
 * @param {number} ownerSide
 * @param {number} allowedSide
 */
export function portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return { col: ownerCol, row: ownerRow };
    if (allowedSide === 0) return { col: ownerCol, row: ownerRow - 1 };
    if (allowedSide === 1) return { col: ownerCol + 1, row: ownerRow };
    if (allowedSide === 2) return { col: ownerCol, row: ownerRow + 1 };
    return { col: ownerCol - 1, row: ownerRow };
}
/** @param {string} accessMode */
export function formatPortalAccessModeLabel(accessMode) {
    if (accessMode === PORTAL_ACCESS_MODE.One) return "One side only";
    return "Both sides";
}
/** @param {number} ownerSide @param {number} allowedSide */
export function formatPortalAccessSideLabel(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return "Owner cell";
    if (allowedSide === 0) return "North neighbor";
    if (allowedSide === 1) return "East neighbor";
    if (allowedSide === 2) return "South neighbor";
    return "West neighbor";
}
/**
 * Portal step blocking for access sides (Part 2b). Part 3 calls this before traverse.
 *
 * @param {number} fromCol
 * @param {number} fromRow
 * @param {number} toCol
 * @param {number} toRow
 * @param {object} edge
 * @param {number} ownerCol
 * @param {number} ownerRow
 * @param {number} ownerSide
 * @returns {boolean} true when the step is blocked
 */
export function portalBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide) {
    if (!isPortalEdge(edge)) return false;
    if (edge.powered !== true) return true;
    if (parsePortalAccessMode(edge.accessMode) === PORTAL_ACCESS_MODE.Both) return false;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, edge.allowedSide ?? portalAccessDefaultAllowedSide(ownerSide));
    return fromCol !== allowed.col || fromRow !== allowed.row;
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
/** Side picker options when access is one — owner cell or neighbor across stamped edge. */
export function portalAccessSideOptions(ownerSide) {
    const mirror = portalAccessDefaultAllowedSide(ownerSide);
    const neighborLabel = ownerSide === 0 ? "North neighbor" : ownerSide === 1 ? "East neighbor" : ownerSide === 2 ? "South neighbor" : "West neighbor";
    return [
        { value: String(mirror), label: "Owner cell" },
        { value: String(ownerSide), label: neighborLabel },
    ];
}
