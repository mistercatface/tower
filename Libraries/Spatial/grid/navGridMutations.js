import { cellBoundsAt, unionCellBounds } from "../../DataStructures/CellRect.js";
import { setBoundary, reconcileBeltBoundaries, clearBeltBoundariesForCell } from "./boundaryOccupancy.js";
import { colRowToIndex } from "./GridUtils.js";
/** @typedef {import("./boundaryOccupancy.js").BoundaryPrimarySpec} NavEdgeSpec */
/**
 * Write one floor cell (belts auto-sync lateral edges).
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {boolean}
 */
export function writeNavFloorCell(grid, idx, kind, facingRadians) {
    return grid.writeFloorCell(idx, kind, facingRadians);
}
/**
 * Clear one floor cell.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {boolean}
 */
export function clearNavFloorCell(grid, idx) {
    return grid.clearFloorCell(idx);
}
/** @param {import("../../DataStructures/CellRect.js").CellBounds[]} parts */
export function mergeNavEditBoundsList(parts) {
    let merged = null;
    for (let i = 0; i < parts.length; i++) if (parts[i]) merged = unionCellBounds(merged, parts[i]);
    return merged;
}
