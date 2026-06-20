import { cellBoundsAt, unionCellBounds } from "../../DataStructures/CellRect.js";
import { setBoundary, reconcileBeltBoundaries, clearBeltBoundariesForCell } from "./boundaryOccupancy.js";
/** @typedef {import("./boundaryOccupancy.js").BoundaryPrimarySpec} NavEdgeSpec */
/**
 * Sync derived beltRail edges for one floor cell — sole belt→edge authoring path.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function syncBeltCellToEdges(grid, col, row, kind, facingIndex) {
    return reconcileBeltBoundaries(grid, col, row, kind, facingIndex);
}
/** @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function clearBeltCellEdges(grid, col, row, kind, facingIndex) {
    clearBeltBoundariesForCell(grid, col, row, kind, facingIndex);
}
/**
 * Write one nav edge (railWall, passage). Returns merged dirty bounds when changed.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {NavEdgeSpec | null} spec
 * @param {{ bumpRevision?: boolean }} [opts]
 * @returns {{ changed: boolean, bounds: import("../../DataStructures/CellRect.js").CellBounds | null }}
 */
export function setNavEdge(grid, col, row, side, spec, { bumpRevision = true } = {}) {
    const bounds = cellBoundsAt(col, row);
    if (!setBoundary(grid, col, row, side, spec, { bumpRevision })) return { changed: false, bounds: null };
    return { changed: true, bounds };
}
/**
 * Write one floor cell (belts auto-sync lateral edges via syncBeltCellToEdges).
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @returns {{ changed: boolean, bounds: import("../../DataStructures/CellRect.js").CellBounds | null }}
 */
export function writeNavFloorCell(grid, col, row, kind, facingRadians) {
    let bounds = cellBoundsAt(col, row);
    if (!grid.writeFloorCell(col, row, kind, facingRadians)) return { changed: false, bounds: null };
    return { changed: true, bounds };
}
/**
 * Clear one floor cell and return dirty bounds.
 *
 * @param {import("./WorldObstacleGrid.js").WorldObstacleGrid} grid
 */
export function clearNavFloorCell(grid, col, row) {
    const bounds = cellBoundsAt(col, row);
    if (!grid.clearFloorCell(col, row)) return { changed: false, bounds: null };
    return { changed: true, bounds };
}
/** @param {import("../../DataStructures/CellRect.js").CellBounds[]} parts */
export function mergeNavEditBoundsList(parts) {
    let merged = null;
    for (let i = 0; i < parts.length; i++) if (parts[i]) merged = unionCellBounds(merged, parts[i]);
    return merged;
}
