import { isPortalEdge } from "./CellEdge.js";
import { canonicalEdgeCellKey, forEachGridEdge } from "../../World/wallGridCells.js";
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function recomputePortalSlotIndex(grid) {
    /** @type {Map<number, { col: number, row: number, side: number }>} */
    const index = new Map();
    if (grid.cols && grid.edgeStore.portalEdgeCount)
        forEachGridEdge(
            grid,
            (col, row, side) => {
                index.set(canonicalEdgeCellKey(grid, col, row, side), { col, row, side });
            },
            { canonicalOnly: true, filter: isPortalEdge },
        );
    grid.portalSlotByKey = index;
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function registerPortalEdgeSlot(grid, col, row, side) {
    if (!grid.portalSlotByKey) grid.portalSlotByKey = new Map();
    grid.portalSlotByKey.set(canonicalEdgeCellKey(grid, col, row, side), { col, row, side });
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function unregisterPortalEdgeSlot(grid, col, row, side) {
    grid.portalSlotByKey?.delete(canonicalEdgeCellKey(grid, col, row, side));
}
/**
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} key
 * @returns {{ col: number, row: number, side: number, edge: object } | null}
 */
export function findPortalEdgeByKey(grid, key) {
    if (!key || !grid.cols) return null;
    const slot = grid.portalSlotByKey?.get(key);
    if (!slot) return null;
    const edge = grid.edgeStore.get(slot.col, slot.row, slot.side, grid.cols);
    if (!isPortalEdge(edge)) return null;
    return { col: slot.col, row: slot.row, side: slot.side, edge };
}
