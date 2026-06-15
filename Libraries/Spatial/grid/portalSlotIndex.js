import { isPortalEdge } from "./CellEdge.js";
import { canonicalEdgeCellKey, forEachGridEdge } from "../../World/wallGridCells.js";
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
export function registerPortalEdgeSlot(grid, col, row, side) {
    grid.portalSlotByKey.set(canonicalEdgeCellKey(grid, col, row, side), { col, row, side });
}
export function unregisterPortalEdgeSlot(grid, col, row, side) {
    grid.portalSlotByKey.delete(canonicalEdgeCellKey(grid, col, row, side));
}
export function findPortalEdgeByKey(grid, key) {
    if (!key || !grid.cols) return null;
    const slot = grid.portalSlotByKey.get(key);
    if (!slot) return null;
    const edge = grid.edgeStore.get(slot.col, slot.row, slot.side, grid.cols);
    if (!isPortalEdge(edge)) return null;
    return { col: slot.col, row: slot.row, side: slot.side, edge };
}
