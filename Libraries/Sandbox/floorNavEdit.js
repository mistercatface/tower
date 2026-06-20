import { cellBoundsAt, isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
/**
 * Schedule worker nav resync after floor-overlay edits (belts, floor-store kinds).
 * Call after grid writes that bump `GRID_NAV_EPOCH.Floor` / belt rail wall epochs.
 *
 * @param {object} state
 * @param {import("../DataStructures/CellRect.js").CellBounds | null} bounds
 * @param {{ invalidateSurfaces?: boolean, fullNavSync?: boolean }} [options]
 */
export function commitFloorNavEdit(state, bounds, { invalidateSurfaces = true, fullNavSync = false } = {}) {
    const grid = state.obstacleGrid;
    if (invalidateSurfaces && state.worldSurfaces)
        if (fullNavSync || !bounds || isEmptyCellBounds(bounds)) state.worldSurfaces.invalidateGridBounds({ startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 }, state);
        else state.worldSurfaces.invalidateGridBounds(bounds, state);
    if (state.sandbox) markGridZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    return state.navigation.onObstaclesChanged(fullNavSync ? null : bounds);
}
/** Stamp or replace one floor cell and resync nav topology. */
export function applyFloorCellEdit(state, col, row, kind, facingRadians) {
    if (!state.obstacleGrid.writeFloorCell(col, row, kind, facingRadians)) return null;
    return commitFloorNavEdit(state, cellBoundsAt(col, row));
}
/** Clear one floor cell and resync nav topology. */
export function clearFloorCellNavEdit(state, col, row) {
    if (!state.obstacleGrid.clearFloorCell(col, row)) return null;
    return commitFloorNavEdit(state, cellBoundsAt(col, row));
}
/** @param {object} state @param {{ col: number, row: number }[]} cells */
export function commitFloorNavEditCells(state, cells) {
    let bounds = null;
    for (let i = 0; i < cells.length; i++) bounds = unionCellBounds(bounds, cellBoundsAt(cells[i].col, cells[i].row));
    if (!bounds) return Promise.resolve();
    return commitFloorNavEdit(state, bounds);
}
