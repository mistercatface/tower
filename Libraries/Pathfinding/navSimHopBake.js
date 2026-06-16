import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { evaluatePortalHopEntry } from "../Sandbox/portalLinks.js";
import { buildPortalSlotByKey } from "../Spatial/grid/portalSlotIndex.js";
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
/** @param {HopCsrAssertContext} ctx @param {number} hopWrite @param {Map<number, import("./boundaryNavHops.js").BoundaryNavHop[]>} hopsByFromIdx */
export function assertHopCsrBake(ctx, hopWrite, hopsByFromIdx) {
    if (hopWrite > 0) return;
    let built = 0;
    for (const list of hopsByFromIdx.values()) built += list.length;
    if (built === 0) return;
    throw new Error(`hop CSR empty but ${built} hop(s) built; navKey=${ctx.navCacheKey ?? ""}`);
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
    simView.portalSlotByKey = buildPortalSlotByKey(simView);
    const hopsByFromIdx = buildBoundaryNavHops(simView, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalHopEntry(g, mouthCol, mouthRow, backCol, backRow, policy));
    const hopWrite = bakeHopCsrFromHopsMap(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost);
    if (assertCtx) assertHopCsrBake(assertCtx, hopWrite, hopsByFromIdx);
    return hopWrite;
}
