import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import { isPortalEdge } from "../Spatial/grid/CellEdge.js";
import { portalMouthAndBackCells, portalTraverseExitCell } from "../Spatial/grid/portalAccess.js";
import { canonicalEdgeCellKey, forEachCellEdge } from "../Spatial/grid/gridCellTopology.js";
import { evaluatePortalHopEntry } from "../Sandbox/portalLinks.js";
/** @typedef {{ portalEdgeCount: number, navCacheKey?: string }} HopCsrAssertContext */
/**
 * Single hop bake entry: edge/policy SAB views on simView → hop CSR SAB.
 * Pathfinding reads only hopOffsets / hopExitIdx / hopCost after this runs.
 *
 * @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView
 * @param {import("./navPassagePolicySab.js").PassageNetworkPolicyView} policy
 * @param {Uint8Array} blocked
 * @param {number} cols
 * @param {number} rows
 * @param {Int32Array} hopOffsets
 * @param {Int32Array} hopExitIdx
 * @param {Uint8Array} hopCost
 * @param {HopCsrAssertContext} [assertCtx]
 */
export function bakePortalHopCsrFromSab(simView, policy, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost, assertCtx) {
    const hopsByFromIdx = collectPortalHopsFromSab(simView, policy);
    const hopWrite = writePortalHopCsr(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost);
    if (assertCtx) assertHopCsrBake(assertCtx, hopWrite, hopsByFromIdx);
    return hopWrite;
}
/** @param {import("./navSimView.js").ReturnType<typeof createNavSimView>} simView @param {import("./navPassagePolicySab.js").PassageNetworkPolicyView} policy */
function collectPortalHopsFromSab(simView, policy) {
    /** @type {Map<number, { exitCol: number, exitRow: number, cost: number }[]>} */
    const hopsByFromIdx = new Map();
    if (!simView.cols || !simView.edgeStore.portalEdgeCount) return hopsByFromIdx;
    forEachCellEdge(
        simView,
        (ownerCol, ownerRow, ownerSide, edge) => {
            const { mouth, back } = portalMouthAndBackCells(ownerCol, ownerRow, ownerSide, edge);
            if (simView.grid[colRowToIndex(mouth.col, mouth.row, simView.cols)] !== 0) return;
            const entry = evaluatePortalHopEntry(simView, mouth.col, mouth.row, back.col, back.row, policy);
            if (!entry) return;
            const exit = portalTraverseExitCell(simView, entry.partner.col, entry.partner.row, entry.partner.side);
            if (!cellInRect(exit.col, exit.row, simView.cols, simView.rows) || simView.grid[colRowToIndex(exit.col, exit.row, simView.cols)] !== 0) return;
            const idx = colRowToIndex(mouth.col, mouth.row, simView.cols);
            let list = hopsByFromIdx.get(idx);
            if (!list) {
                list = [];
                hopsByFromIdx.set(idx, list);
            }
            if (list.some((hop) => hop.exitCol === exit.col && hop.exitRow === exit.row)) return;
            list.push({ exitCol: exit.col, exitRow: exit.row, cost: 1 });
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    return hopsByFromIdx;
}
/** @param {Map<number, { exitCol: number, exitRow: number, cost: number }[]>} hopsByFromIdx */
function writePortalHopCsr(hopsByFromIdx, blocked, cols, rows, hopOffsets, hopExitIdx, hopCost) {
    const size = cols * rows;
    let write = 0;
    for (let idx = 0; idx < size; idx++) {
        hopOffsets[idx] = write;
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
/** @param {HopCsrAssertContext} ctx @param {number} hopWrite @param {Map<number, { exitCol: number, exitRow: number, cost: number }[]>} hopsByFromIdx */
export function assertHopCsrBake(ctx, hopWrite, hopsByFromIdx) {
    if (hopWrite > 0) return;
    let built = 0;
    for (const list of hopsByFromIdx.values()) built += list.length;
    if (built === 0) return;
    throw new Error(`hop CSR empty but ${built} hop(s) built; navKey=${ctx.navCacheKey ?? ""}`);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {Int32Array} hopOffsets */
export function assertMainNavHopSab(grid, hopOffsets, navCacheKey = "") {
    const size = grid.cols * grid.rows;
    if (!size || hopOffsets[size] > 0) return;
    const powered = grid._passagePoweredKeys;
    const networkIdByKey = grid._passageNetworkIdByKey;
    if (!powered?.size || !networkIdByKey) return;
    let linkedPowered = false;
    forEachCellEdge(
        grid,
        (col, row, side, edge) => {
            if (!(edge.partnerKey ?? 0)) return;
            const key = canonicalEdgeCellKey(grid, col, row, side);
            if (!powered.has(key)) return;
            if ((networkIdByKey.get(key) ?? -1) < 0) return;
            linkedPowered = true;
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    if (!linkedPowered) return;
    throw new Error(`hop CSR empty with linked powered portal(s); navKey=${navCacheKey}`);
}
