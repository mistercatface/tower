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
    const damageBounds = fullNavSync ? null : merged;
    return nav.commitEdit(damageBounds, { fullNavSync });
}
function chunkRangeCellBounds(grid, cellsPerChunk, minChunkCol, minChunkRow, maxChunkCol, maxChunkRow) {
    const startCol = Math.max(0, minChunkCol * cellsPerChunk);
    const startRow = Math.max(0, minChunkRow * cellsPerChunk);
    const endCol = Math.min(grid.cols - 1, (maxChunkCol + 1) * cellsPerChunk - 1);
    const endRow = Math.min(grid.rows - 1, (maxChunkRow + 1) * cellsPerChunk - 1);
    if (startCol > endCol || startRow > endRow) return null;
    return { startCol, endCol, startRow, endRow };
}
export function commitSurfaceMaterialEdit(state, bounds) {
    if (!bounds || isEmptyCellBounds(bounds) || bounds.startCol > bounds.endCol || bounds.startRow > bounds.endRow) return null;
    if (state.worldSurfaces) state.worldSurfaces.invalidateGridBounds(bounds, state);
    if (state.sandbox) markGridZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    return bounds;
}
export function setChunkSurfaceProfileEdit(state, chunkCol, chunkRow, profileId) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.setChunkSurfaceProfile(chunkCol, chunkRow, profileId, cellsPerChunk);
    return commitSurfaceMaterialEdit(state, chunkRangeCellBounds(state.obstacleGrid, cellsPerChunk, chunkCol, chunkRow, chunkCol, chunkRow));
}
export function clearChunkSurfaceProfileEdit(state, chunkCol, chunkRow) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.clearChunkSurfaceProfile(chunkCol, chunkRow, cellsPerChunk);
    return commitSurfaceMaterialEdit(state, chunkRangeCellBounds(state.obstacleGrid, cellsPerChunk, chunkCol, chunkRow, chunkCol, chunkRow));
}
export function setChunkSurfaceProfileRangeEdit(state, minChunkCol, minChunkRow, maxChunkCol, maxChunkRow, profileId) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.setChunkSurfaceProfileRange(minChunkCol, minChunkRow, maxChunkCol, maxChunkRow, profileId, cellsPerChunk);
    return commitSurfaceMaterialEdit(state, chunkRangeCellBounds(state.obstacleGrid, cellsPerChunk, minChunkCol, minChunkRow, maxChunkCol, maxChunkRow));
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
