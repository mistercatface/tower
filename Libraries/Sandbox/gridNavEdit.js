import { cellBoundsAt, isEmptyCellBounds, unionCellBounds } from "../DataStructures/CellRect.js";
import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { writeNavFloorCell, clearNavFloorCell } from "../Spatial/grid/navGridMutations.js";
import { resolveNavRuntime } from "../Navigation/NavRuntime.js";
/** @param {import("../DataStructures/CellRect.js").CellBounds | import("../DataStructures/CellRect.js").CellBounds[] | null | undefined} bounds */
function mergeNavEditBounds(bounds) {
    if (!bounds) return null;
    const regions = Array.isArray(bounds) ? bounds : [bounds];
    let merged = null;
    for (let i = 0; i < regions.length; i++) if (regions[i]) merged = unionCellBounds(merged, regions[i]);
    return merged;
}
/**
 * Schedule one worker nav resync after grid edits (walls, belts, boundaries).
 * Grid writes must bump the relevant epoch channels before calling this.
 *
 * @param {object} state
 * @param {import("../DataStructures/CellRect.js").CellBounds | import("../DataStructures/CellRect.js").CellBounds[] | null} bounds
 * @param {{ invalidateSurfaces?: boolean, fullNavSync?: boolean }} [options]
 */
export function commitGridNavEdit(state, bounds, { invalidateSurfaces = true, fullNavSync = false } = {}) {
    const merged = fullNavSync ? null : mergeNavEditBounds(bounds);
    if (!fullNavSync && (!merged || isEmptyCellBounds(merged))) return Promise.resolve();
    const grid = state.obstacleGrid;
    if (invalidateSurfaces && state.worldSurfaces)
        if (fullNavSync || !merged) state.worldSurfaces.invalidateGridBounds({ startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 }, state);
        else state.worldSurfaces.invalidateGridBounds(merged, state);
    if (state.sandbox) markGridZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    const nav = resolveNavRuntime(state);
    if (!nav) return Promise.resolve();
    if (state.nav == null) state.nav = nav;
    const damageBounds = fullNavSync ? null : merged;
    if (typeof nav.commitEdit === "function") return nav.commitEdit(damageBounds, { fullNavSync });
    return nav.onObstaclesChanged(damageBounds);
}
/** One resync for multiple dirty regions (rails + belts, clear + stamp, etc.). */
export function commitGridNavEditUnion(state, ...boundsParts) {
    const parts = boundsParts.filter(Boolean);
    if (!parts.length) return Promise.resolve();
    return commitGridNavEdit(state, parts);
}
/** Stamp or replace one floor cell and resync nav topology. */
export function applyFloorCellEdit(state, col, row, kind, facingRadians) {
    const { changed, bounds } = writeNavFloorCell(state.obstacleGrid, col, row, kind, facingRadians);
    if (!changed) return null;
    return commitGridNavEdit(state, bounds);
}
/** Clear one floor cell and resync nav topology. */
export function clearFloorCellNavEdit(state, col, row) {
    const { changed, bounds } = clearNavFloorCell(state.obstacleGrid, col, row);
    if (!changed) return null;
    return commitGridNavEdit(state, bounds);
}
/** @param {object} state @param {{ col: number, row: number }[]} cells */
export function commitGridNavEditCells(state, cells) {
    let bounds = null;
    for (let i = 0; i < cells.length; i++) bounds = unionCellBounds(bounds, cellBoundsAt(cells[i].col, cells[i].row));
    if (!bounds) return Promise.resolve();
    return commitGridNavEdit(state, bounds);
}
