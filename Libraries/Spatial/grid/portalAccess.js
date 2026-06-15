import { crossingGrantAllows } from "../../Pathfinding/crossingGrant.js";
import { formatGridSideNeighborLabel, gridSideNeighborCell, gridSideOutwardVector } from "./GridUtils.js";
import { gridWallEdgeMirrorSide, gridWallEdgeNeighbor } from "./gridCellTopology.js";
import { PORTAL_ACCESS_MODE } from "./CellEdge.js";
export function portalAccessDefaultAllowedSide(ownerSide) {
    return gridWallEdgeMirrorSide(ownerSide);
}
// allowedSide === mirror(ownerSide) → owner cell; otherwise neighbor in direction allowedSide.
export function portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return { col: ownerCol, row: ownerRow };
    return gridSideNeighborCell(ownerCol, ownerRow, allowedSide);
}
export function formatPortalAccessSideLabel(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return "Owner cell";
    return formatGridSideNeighborLabel(allowedSide);
}
export function portalMouthAllowedSide(edge, ownerSide) {
    if (edge.accessMode === PORTAL_ACCESS_MODE.Both) return portalAccessDefaultAllowedSide(ownerSide);
    return edge.allowedSide ?? portalAccessDefaultAllowedSide(ownerSide);
}
export function portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge) {
    const mouth = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    const { nc, nr } = gridWallEdgeNeighbor(ownerCol, ownerRow, ownerSide);
    const back = mouth.col === ownerCol && mouth.row === ownerRow ? { col: nc, row: nr } : { col: ownerCol, row: ownerRow };
    return { mouth, back };
}
export function portalEdgeEmitsCollision(edge) {
    return true;
}
export function portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, allowedSide) {
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, allowedSide);
    if (allowed.col === ownerCol && allowed.row === ownerRow) return gridSideOutwardVector(ownerSide);
    return gridSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
}
export function portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide) {
    return portalAllowedCrossingVector(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
}
// Body center crossed the portal mid-plane toward the back cell (traverse only — stricter than mouth zone).
export function portalBodyCrossedEntryPlane(bodyX, bodyY, mouth, back, cross, grid, bodyRadius = 0) {
    const mouthWorld = grid.gridToWorld(mouth.col, mouth.row);
    const backWorld = grid.gridToWorld(back.col, back.row);
    const midX = (mouthWorld.x + backWorld.x) * 0.5;
    const midY = (mouthWorld.y + backWorld.y) * 0.5;
    if (cross.x === 0) {
        if (Math.abs(bodyX - midX) > grid.cellHalfSize + 0.5) return false;
    } else if (Math.abs(bodyY - midY) > grid.cellHalfSize + 0.5) return false;
    const mouthSide = -((bodyX - midX) * cross.x + (bodyY - midY) * cross.y);
    return mouthSide > -bodyRadius * 0.35;
}
// Mouth-side half-plane: back cell is never the mouth.
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
    return mouthSide >= -bodyRadius && mouthSide <= grid.cellHalfSize + bodyRadius;
}
export function portalEdgeBlocksCollision(edge, ownerCol, ownerRow, ownerSide, entity, bodyRadius, vx, vy, dispX, dispY, grid) {
    if (!portalEdgeEmitsCollision(edge)) return false;
    if (edge.powered !== true) return true;
    if (!portalBodyInMouthZone(grid, edge, ownerCol, ownerRow, ownerSide, entity.x, entity.y, bodyRadius)) return true;
    const cross = portalCrossingVectorForEdge(edge, ownerCol, ownerRow, ownerSide);
    const { mouth } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
    return !crossingGrantAllows(entity, mouth.col, mouth.row, cross, vx, vy, dispX, dispY);
}
export function portalTraverseExitCell(grid, partnerCol, partnerRow, partnerSide) {
    const edge = grid.edgeStore.get(partnerCol, partnerRow, partnerSide, grid.cols);
    const { mouth } = portalMouthAndBackCells(partnerCol, partnerRow, partnerSide, edge);
    return mouth;
}
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
export function resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow) {
    const dc = toCol - fromCol;
    const dr = toRow - fromRow;
    if (dc !== 0 && dr === 0) return { ownerCol: fromCol, ownerRow: fromRow, ownerSide: dc > 0 ? 1 : 3 };
    if (dc === 0 && dr !== 0) return { ownerCol: fromCol, ownerRow: fromRow, ownerSide: dr > 0 ? 2 : 0 };
    return null;
}
export function portalAccessArrowVector(ownerSide, allowedSide) {
    if (allowedSide === portalAccessDefaultAllowedSide(ownerSide)) return gridSideOutwardVector(portalAccessDefaultAllowedSide(ownerSide));
    return gridSideOutwardVector(allowedSide);
}
