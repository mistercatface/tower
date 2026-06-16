import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge, isPassagePowerConductorEdge } from "../Spatial/grid/CellEdge.js";
import { canonicalEdgeCellKey, forEachCellEdge } from "../Spatial/grid/gridCellTopology.js";
import { evaluatePortalHopEntry } from "../Sandbox/portalLinks.js";
import { buildBoundaryNavHops } from "./boundaryNavHops.js";
/** @typedef {{ networkIdByKey: Map<number, number> }} PassageNetworkPolicyView */
/** @typedef {{ portalEdgeCount: number, navCacheKey?: string }} HopCsrAssertContext */
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
/** @param {HopCsrAssertContext} ctx @param {number} hopWrite @param {PassageNetworkPolicyView} policy */
export function assertHopCsrBake(ctx, hopWrite, policy) {
    if (!ctx.portalEdgeCount) return;
    if (policy.networkIdByKey.size === 0) return;
    if (hopWrite > 0) return;
    throw new Error(`hop CSR empty with ${ctx.portalEdgeCount} portal(s) and ${policy.networkIdByKey.size} powered key(s); navKey=${ctx.navCacheKey ?? ""}`);
}
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView @param {PassageNetworkPolicyView} policy */
export function buildBoundaryNavHopsOnSim(simView, policy) {
    simView.portalSlotByKey = buildPortalSlotByKey(simView);
    return buildBoundaryNavHops(simView, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalHopEntry(g, mouthCol, mouthRow, backCol, backRow, policy));
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
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView @param {PassageNetworkPolicyView} policy @param {Uint8Array} blocked @param {HopCsrAssertContext} [assertCtx] */
export function bakeHopCsrOnSim(simView, policy, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost, assertCtx) {
    const hopsByFromIdx = buildBoundaryNavHopsOnSim(simView, policy);
    const hopWrite = bakeHopCsrFromHopsMap(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost);
    if (assertCtx) assertHopCsrBake(assertCtx, hopWrite, policy);
    return hopWrite;
}
