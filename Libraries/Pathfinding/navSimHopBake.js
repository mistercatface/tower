import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge, isPassagePowerConductorEdge } from "../Spatial/grid/CellEdge.js";
import { portalMouthAndBackCells, portalTraverseExitCell, resolveCardinalStepCrossing } from "../Spatial/grid/portalAccess.js";
import { canonicalEdgeCellKey, forEachCellEdge } from "../Spatial/grid/gridCellTopology.js";
import { portalPassageBlocksStepFrom } from "../Sandbox/portalStep.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute, resolvePortalPartner } from "../Sandbox/portalLinks.js";
import { buildBoundaryNavHops } from "./boundaryNavHops.js";
/** Copy last passage-power network ids onto edge pool objects (worker hop bake reads edge.networkId). */
export function stampPassageNetworkIdsOnGrid(grid) {
    const poweredKeys = grid._passagePoweredKeys;
    const networkIdByKey = grid._passageNetworkIdByKey;
    if (!poweredKeys || !networkIdByKey || !grid.cols) return;
    forEachCellEdge(
        grid,
        (col, row, side) => {
            const key = canonicalEdgeCellKey(grid, col, row, side);
            const edge = grid.edgeStore.get(col, row, side, grid.cols);
            edge.networkId = poweredKeys.has(key) ? (networkIdByKey.get(key) ?? -1) : -1;
        },
        { filter: isPassagePowerConductorEdge },
    );
}
/** @param {import("./navSimView.js").ReturnType<import("./navSimView.js").createNavSimView>} simView */
export function buildPortalSlotByKey(simView) {
    const index = new Map();
    if (!simView.cols || !simView.edgeStore.portalEdgeCount) return index;
    forEachCellEdge(
        simView,
        (col, row, side) => {
            index.set(canonicalEdgeCellKey(simView, col, row, side), { col, row, side });
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    return index;
}
function canLinkPortalsOnSimNetwork(simView, colA, rowA, sideA, colB, rowB, sideB) {
    const edgeA = simView.edgeStore.get(colA, rowA, sideA, simView.cols);
    const edgeB = simView.edgeStore.get(colB, rowB, sideB, simView.cols);
    const netA = edgeA?.networkId ?? -1;
    if (netA < 0) return false;
    return netA === (edgeB?.networkId ?? -1);
}
/**
 * Worker-safe portal hop entry gate — same rules as evaluatePortalStepEntry, reads edge.networkId.
 * @param {import("./navSimView.js").ReturnType<import("./navSimView.js").createNavSimView>} simView
 */
export function evaluatePortalHopEntryOnSim(simView, fromCol, fromRow, toCol, toRow) {
    const crossing = resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow);
    if (!crossing) return null;
    const { ownerCol, ownerRow, ownerSide } = crossing;
    const edge = simView.edgeStore.get(ownerCol, ownerRow, ownerSide, simView.cols);
    if (!isPortalEdge(edge)) return null;
    if (edge.powered !== true) return null;
    if (portalPassageBlocksStepFrom(fromCol, fromRow, toCol, toRow, edge, ownerCol, ownerRow, ownerSide)) return null;
    const partner = resolvePortalPartner(simView, ownerCol, ownerRow, ownerSide);
    if (!partner) return null;
    if (!canLinkPortalsOnSimNetwork(simView, ownerCol, ownerRow, ownerSide, partner.col, partner.row, partner.side)) return null;
    const route = resolvePortalLinkRoute(simView, ownerCol, ownerRow, ownerSide, partner);
    if (!route) return null;
    if (route.linkMode === PORTAL_LINK_MODE.OneWay) {
        const isSource = route.source.col === ownerCol && route.source.row === ownerRow && route.source.side === ownerSide;
        if (!isSource) return null;
    }
    return { source: { col: ownerCol, row: ownerRow, side: ownerSide }, partner, route };
}
/** @param {import("./navSimView.js").ReturnType<import("./navSimView.js").createNavSimView>} simView */
export function buildBoundaryNavHopsOnSim(simView) {
    simView.portalSlotByKey = buildPortalSlotByKey(simView);
    return buildBoundaryNavHops(simView, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalHopEntryOnSim(g, mouthCol, mouthRow, backCol, backRow));
}
/**
 * @param {Map<number, import("./boundaryNavHops.js").BoundaryNavHop[]>} hopsByFromIdx
 * @param {Uint8Array} blocked
 * @param {Int32Array} hopOffsets
 * @param {Int32Array} hopExitIdx
 * @param {Uint8Array} hopCost
 */
export function bakeHopCsrFromHopsMap(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost) {
    const size = cols * rows;
    let write = 0;
    for (let idx = 0; idx < size; idx++) {
        hopOffsets[idx] = write;
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const hops = hopsByFromIdx.get(idx);
        if (hops)
            for (let i = 0; i < hops.length; i++) {
                const { exitCol, exitRow, cost } = hops[i];
                if (blocked[colRowToIndex(exitCol, exitRow, cols)]) continue;
                if (write >= hopExitIdx.length) throw new Error(`hop CSR overflow: need slot ${write}, cap ${hopExitIdx.length}`);
                hopExitIdx[write] = colRowToIndex(exitCol, exitRow, cols);
                hopCost[write] = cost;
                write++;
            }
    }
    hopOffsets[size] = write;
    return write;
}
/** @param {import("./navSimView.js").ReturnType<import("./navSimView.js").createNavSimView>} simView @param {Uint8Array} blocked */
export function bakeHopCsrOnSim(simView, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost) {
    const hopsByFromIdx = buildBoundaryNavHopsOnSim(simView);
    return bakeHopCsrFromHopsMap(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost);
}
