import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { findPortalEdgeByKey } from "../Spatial/grid/portalSlotIndex.js";
import { resolveCardinalStepCrossing, portalAccessInitiatorCell, portalMouthAllowedSide } from "../Spatial/grid/portalAccess.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canonicalEdgeCellKey } from "../Spatial/grid/gridCellTopology.js";
export const PORTAL_LINK_MODE = { Shared: "shared", OneWay: "oneWay" };
/** @param {unknown} raw */
export function parsePortalLinkMode(raw) {
    if (raw === PORTAL_LINK_MODE.OneWay) return PORTAL_LINK_MODE.OneWay;
    return PORTAL_LINK_MODE.Shared;
}
/** @param {string} linkMode @param {boolean} fromSelf */
export function formatPortalConnectionLabel(linkMode, fromSelf) {
    if (linkMode !== PORTAL_LINK_MODE.OneWay) return "Shared (⇄)";
    return fromSelf ? "One-way (this → partner)" : "One-way (partner → this)";
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @returns {{ col: number, row: number, side: number } | null}
 */
export function resolvePortalPartner(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isPortalEdge(edge)) return null;
    const partnerKey = edge.partnerKey ?? 0;
    if (!partnerKey) return null;
    const selfKey = canonicalEdgeCellKey(grid, col, row, side);
    if (partnerKey === selfKey) return null;
    const found = findPortalEdgeByKey(grid, partnerKey);
    if (!found) return null;
    return { col: found.col, row: found.row, side: found.side };
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @returns {{ linkMode: string, linkSourceKey: number, partner: { col: number, row: number, side: number }, source: { col: number, row: number, side: number }, dest: { col: number, row: number, side: number }, fromSelf: boolean } | null}
 */
export function resolvePortalLinkRoute(grid, col, row, side, partnerIn = null) {
    const partner = partnerIn ?? resolvePortalPartner(grid, col, row, side);
    if (!partner) return null;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    const selfKey = canonicalEdgeCellKey(grid, col, row, side);
    const linkMode = parsePortalLinkMode(edge.linkMode);
    const linkSourceKey = edge.linkSourceKey ?? 0;
    const self = { col, row, side };
    if (linkMode === PORTAL_LINK_MODE.OneWay && linkSourceKey !== 0 && linkSourceKey !== selfKey) return { linkMode, linkSourceKey, partner, source: partner, dest: self, fromSelf: false };
    return { linkMode, linkSourceKey: linkMode === PORTAL_LINK_MODE.OneWay ? selfKey : 0, partner, source: self, dest: partner, fromSelf: true };
}
/** @param {object} edge */
function writePortalLinkFields(edge, linkMode, linkSourceKey) {
    edge.linkMode = parsePortalLinkMode(linkMode);
    edge.linkSourceKey = edge.linkMode === PORTAL_LINK_MODE.OneWay ? linkSourceKey : 0;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @param {string} linkMode
 * @param {number} [linkSourceKey]
 * @returns {boolean}
 */
export function setPortalLinkProfile(grid, col, row, side, linkMode, linkSourceKey = 0) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isPortalEdge(edge)) return false;
    const partner = resolvePortalPartner(grid, col, row, side);
    const mode = parsePortalLinkMode(linkMode);
    const sourceKey = mode === PORTAL_LINK_MODE.OneWay ? linkSourceKey || canonicalEdgeCellKey(grid, col, row, side) : 0;
    writePortalLinkFields(edge, mode, sourceKey);
    if (partner) {
        const partnerEdge = grid.edgeStore.get(partner.col, partner.row, partner.side, grid.cols);
        writePortalLinkFields(partnerEdge, mode, sourceKey);
    }
    grid.bumpPortalLinkEpoch();
    return true;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} col
 * @param {number} row
 * @param {number} side
 * @returns {boolean}
 */
export function unlinkPortalEdge(grid, col, row, side) {
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isPortalEdge(edge)) return false;
    const selfKey = canonicalEdgeCellKey(grid, col, row, side);
    const partnerKey = edge.partnerKey ?? 0;
    edge.partnerKey = 0;
    writePortalLinkFields(edge, PORTAL_LINK_MODE.Shared, 0);
    if (partnerKey) {
        const partner = findPortalEdgeByKey(grid, partnerKey);
        if (partner && (partner.edge.partnerKey ?? 0) === selfKey) {
            partner.edge.partnerKey = 0;
            writePortalLinkFields(partner.edge, PORTAL_LINK_MODE.Shared, 0);
        }
    }
    grid.bumpPortalLinkEpoch();
    return true;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} colA
 * @param {number} rowA
 * @param {number} sideA
 * @param {number} colB
 * @param {number} rowB
 * @param {number} sideB
 * @returns {boolean}
 */
export function linkPortalEdges(grid, colA, rowA, sideA, colB, rowB, sideB) {
    if (!cellInRect(colA, rowA, grid.cols, grid.rows) || !cellInRect(colB, rowB, grid.cols, grid.rows)) return false;
    const edgeA = grid.edgeStore.get(colA, rowA, sideA, grid.cols);
    const edgeB = grid.edgeStore.get(colB, rowB, sideB, grid.cols);
    if (!isPortalEdge(edgeA) || !isPortalEdge(edgeB)) return false;
    const keyA = canonicalEdgeCellKey(grid, colA, rowA, sideA);
    const keyB = canonicalEdgeCellKey(grid, colB, rowB, sideB);
    if (keyA === keyB) return false;
    unlinkPortalEdge(grid, colA, rowA, sideA);
    unlinkPortalEdge(grid, colB, rowB, sideB);
    edgeA.partnerKey = keyB;
    edgeB.partnerKey = keyA;
    const linkMode = parsePortalLinkMode(edgeA.linkMode);
    const linkSourceKey = edgeA.linkSourceKey ?? 0;
    writePortalLinkFields(edgeA, linkMode, linkSourceKey);
    writePortalLinkFields(edgeB, linkMode, linkSourceKey);
    grid.bumpPortalLinkEpoch();
    return true;
}
/** @param {import("../Pathfinding/navPassagePolicySab.js").PassageNetworkPolicyView} policy @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function canLinkPortalsOnPolicy(policy, grid, colA, rowA, sideA, colB, rowB, sideB) {
    const keyA = canonicalEdgeCellKey(grid, colA, rowA, sideA);
    const netA = policy.networkIdByKey.get(keyA);
    if (netA === undefined || netA < 0) return false;
    const keyB = canonicalEdgeCellKey(grid, colB, rowB, sideB);
    return netA === policy.networkIdByKey.get(keyB);
}
/**
 * Portal hop / traverse entry gate — policy-backed (worker + main share this).
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {import("../Pathfinding/navPassagePolicySab.js").PassageNetworkPolicyView} policy
 */
export function evaluatePortalHopEntry(grid, fromCol, fromRow, toCol, toRow, policy) {
    const crossing = resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow);
    if (!crossing) return null;
    const { ownerCol, ownerRow, ownerSide } = crossing;
    const edge = grid.edgeStore.get(ownerCol, ownerRow, ownerSide, grid.cols);
    if (!isPortalEdge(edge)) return null;
    const ownerKey = canonicalEdgeCellKey(grid, ownerCol, ownerRow, ownerSide);
    if (!policy.networkIdByKey.has(ownerKey)) return null;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    if (fromCol !== allowed.col || fromRow !== allowed.row) return null;
    const partner = resolvePortalPartner(grid, ownerCol, ownerRow, ownerSide);
    if (!partner) return null;
    if (!canLinkPortalsOnPolicy(policy, grid, ownerCol, ownerRow, ownerSide, partner.col, partner.row, partner.side)) return null;
    const route = resolvePortalLinkRoute(grid, ownerCol, ownerRow, ownerSide, partner);
    if (!route) return null;
    if (route.linkMode === PORTAL_LINK_MODE.OneWay) {
        const isSource = route.source.col === ownerCol && route.source.row === ownerRow && route.source.side === ownerSide;
        if (!isSource) return null;
    }
    return { source: { col: ownerCol, row: ownerRow, side: ownerSide }, partner, route };
}
