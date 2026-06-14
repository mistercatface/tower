import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canonicalEdgeCellKey } from "../World/wallGridCells.js";
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
 * @param {number} key
 * @returns {{ col: number, row: number, side: number, edge: object } | null}
 */
export function findPortalEdgeByKey(grid, key) {
    if (!key || !grid.cols) return null;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) {
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            if (!isPortalEdge(edge)) continue;
            if (canonicalEdgeCellKey(grid, col, row, side) !== key) continue;
            return { col, row, side, edge };
        }
    }
    return null;
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
export function resolvePortalLinkRoute(grid, col, row, side) {
    const partner = resolvePortalPartner(grid, col, row, side);
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
    return true;
}
