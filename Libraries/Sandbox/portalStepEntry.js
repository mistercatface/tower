import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { portalBlocksStepFrom, resolveCardinalStepCrossing } from "../Spatial/grid/portalAccess.js";
import { canLinkPortalsOnNetwork } from "./passagePowerNetwork.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute, resolvePortalPartner } from "./portalLinks.js";
/**
 * Part 3 entry gate — returns traverse context when a cardinal step onto a portal is valid.
 * Does not mutate entity state or teleport.
 *
 * @param {object} state
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} fromCol
 * @param {number} fromRow
 * @param {number} toCol
 * @param {number} toRow
 * @returns {{ source: { col: number, row: number, side: number }, partner: { col: number, row: number, side: number }, route: ReturnType<typeof resolvePortalLinkRoute> } | null}
 */
export function evaluatePortalStepEntry(state, grid, fromCol, fromRow, toCol, toRow) {
    const crossing = resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow);
    if (!crossing) return null;
    const { ownerCol, ownerRow, ownerSide } = crossing;
    const edge = grid.edgeStore.get(ownerCol, ownerRow, ownerSide, grid.cols);
    if (!isPortalEdge(edge)) return null;
    if (portalBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide)) return null;
    const partner = resolvePortalPartner(grid, ownerCol, ownerRow, ownerSide);
    if (!partner) return null;
    if (!canLinkPortalsOnNetwork(state, grid, ownerCol, ownerRow, ownerSide, partner.col, partner.row, partner.side)) return null;
    const route = resolvePortalLinkRoute(grid, ownerCol, ownerRow, ownerSide);
    if (!route) return null;
    if (route.linkMode === PORTAL_LINK_MODE.OneWay) {
        const isSource = route.source.col === ownerCol && route.source.row === ownerRow && route.source.side === ownerSide;
        if (!isSource) return null;
    }
    return { source: { col: ownerCol, row: ownerRow, side: ownerSide }, partner, route };
}
