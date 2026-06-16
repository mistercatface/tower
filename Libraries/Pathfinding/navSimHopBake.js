import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge, isPassagePowerConductorEdge } from "../Spatial/grid/CellEdge.js";
import { resolveCardinalStepCrossing, portalAccessInitiatorCell, portalMouthAllowedSide } from "../Spatial/grid/portalAccess.js";
import { canonicalEdgeCellKey, forEachCellEdge } from "../Spatial/grid/gridCellTopology.js";
import { PORTAL_LINK_MODE, resolvePortalLinkRoute, resolvePortalPartner } from "../Sandbox/portalLinks.js";
import { buildBoundaryNavHops } from "./boundaryNavHops.js";
/** @typedef {{ networkIdByKey: Map<number, number> }} PassageNetworkPolicyView */
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function packPassageNetworkPolicy(grid) {
    const poweredKeys = grid._passagePoweredKeys;
    const networkIdByKey = grid._passageNetworkIdByKey;
    if (!poweredKeys || !networkIdByKey || poweredKeys.size === 0) return { passageNetworkKeys: new Int32Array(0), passageNetworkIds: new Int32Array(0) };
    const passageNetworkKeys = new Int32Array(poweredKeys.size);
    const passageNetworkIds = new Int32Array(poweredKeys.size);
    let i = 0;
    for (const key of poweredKeys) {
        passageNetworkKeys[i] = key;
        passageNetworkIds[i] = networkIdByKey.get(key) ?? -1;
        i++;
    }
    return { passageNetworkKeys, passageNetworkIds };
}
/** @param {Int32Array} passageNetworkKeys @param {Int32Array} passageNetworkIds */
export function createPassageNetworkPolicyView(passageNetworkKeys, passageNetworkIds) {
    const networkIdByKey = new Map();
    for (let i = 0; i < passageNetworkKeys.length; i++) networkIdByKey.set(passageNetworkKeys[i], passageNetworkIds[i]);
    return { networkIdByKey };
}
/** Copy last passage-power network ids onto edge pool objects (main overlay / debug only). */
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
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView */
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
/** @param {PassageNetworkPolicyView} policy @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView */
function canLinkPortalsOnPolicy(policy, simView, colA, rowA, sideA, colB, rowB, sideB) {
    const keyA = canonicalEdgeCellKey(simView, colA, rowA, sideA);
    const netA = policy.networkIdByKey.get(keyA);
    if (netA === undefined || netA < 0) return false;
    const keyB = canonicalEdgeCellKey(simView, colB, rowB, sideB);
    return netA === policy.networkIdByKey.get(keyB);
}
/**
 * Worker portal hop entry gate — uses packed passage-network policy from main (not cloned edge.powered).
 * @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView
 * @param {PassageNetworkPolicyView} policy
 */
export function evaluatePortalHopEntryOnSim(simView, policy, fromCol, fromRow, toCol, toRow) {
    const crossing = resolveCardinalStepCrossing(fromCol, fromRow, toCol, toRow);
    if (!crossing) return null;
    const { ownerCol, ownerRow, ownerSide } = crossing;
    const edge = simView.edgeStore.get(ownerCol, ownerRow, ownerSide, simView.cols);
    if (!isPortalEdge(edge)) return null;
    const ownerKey = canonicalEdgeCellKey(simView, ownerCol, ownerRow, ownerSide);
    if (!policy.networkIdByKey.has(ownerKey)) return null;
    const allowed = portalAccessInitiatorCell(ownerCol, ownerRow, ownerSide, portalMouthAllowedSide(edge, ownerSide));
    if (fromCol !== allowed.col || fromRow !== allowed.row) return null;
    const partner = resolvePortalPartner(simView, ownerCol, ownerRow, ownerSide);
    if (!partner) return null;
    if (!canLinkPortalsOnPolicy(policy, simView, ownerCol, ownerRow, ownerSide, partner.col, partner.row, partner.side)) return null;
    const route = resolvePortalLinkRoute(simView, ownerCol, ownerRow, ownerSide, partner);
    if (!route) return null;
    if (route.linkMode === PORTAL_LINK_MODE.OneWay) {
        const isSource = route.source.col === ownerCol && route.source.row === ownerRow && route.source.side === ownerSide;
        if (!isSource) return null;
    }
    return { source: { col: ownerCol, row: ownerRow, side: ownerSide }, partner, route };
}
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView @param {PassageNetworkPolicyView} policy */
export function buildBoundaryNavHopsOnSim(simView, policy) {
    simView.portalSlotByKey = buildPortalSlotByKey(simView);
    return buildBoundaryNavHops(simView, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalHopEntryOnSim(g, policy, mouthCol, mouthRow, backCol, backRow));
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
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView @param {PassageNetworkPolicyView} policy @param {Uint8Array} blocked */
export function bakeHopCsrOnSim(simView, policy, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost) {
    const hopsByFromIdx = buildBoundaryNavHopsOnSim(simView, policy);
    return bakeHopCsrFromHopsMap(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost);
}
