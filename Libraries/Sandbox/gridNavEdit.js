import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { writeNavFloorCell, clearNavFloorCell } from "../Spatial/grid/navGridMutations.js";
import { chunkRangeToCellBounds } from "../Spatial/grid/GridCoords.js";
import { resolveNavRuntime } from "../Navigation/NavRuntime.js";
/**
 * Schedule one worker nav resync after grid edits (walls, belts, boundaries).
 * Grid writes must bump the relevant epoch channels before calling this.
 *
 * @param {object} state
 * @param {number} idx
 * @param {{ invalidateSurfaces?: boolean, fullNavSync?: boolean }} [options]
 */
export function commitGridNavEdit(state, idx, { invalidateSurfaces = true, fullNavSync = false } = {}) {
    const grid = state.obstacleGrid;
    if (!fullNavSync && idx === null) return Promise.resolve();
    if (invalidateSurfaces && state.worldSurfaces)
        if (fullNavSync || idx === null) state.worldSurfaces.invalidateGridBounds({ startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 }, grid);
        else state.worldSurfaces.invalidateGridBounds(idx, grid);
    if (state.sandbox) markGridZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    const nav = resolveNavRuntime(state);
    return nav.commitEdit(idx, { fullNavSync });
}
export function commitGridNavEditUnion(state, ...indices) {
    const parts = indices.filter((x) => typeof x === "number");
    if (!parts.length) return Promise.resolve();
    for (let i = 0; i < parts.length; i++) commitGridNavEdit(state, parts[i]);
    return Promise.resolve();
}
export function commitSurfaceMaterialEdit(state, idx) {
    if (state.worldSurfaces) state.worldSurfaces.invalidateGridBounds(idx, state.obstacleGrid);
    if (state.sandbox) markGridZoneSubscriptionsDirty(state);
    if (state.editor != null || state.appLaunch != null) rebuildLabMapCaches(state);
    return idx;
}
export function setChunkSurfaceProfileEdit(state, chunkBounds, profileId) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.setChunkSurfaceProfileRange(chunkBounds, profileId, cellsPerChunk);
    commitSurfaceMaterialEdit(state, null);
    return chunkRangeToCellBounds(chunkBounds, cellsPerChunk, state.obstacleGrid.cols, state.obstacleGrid.rows);
}
export function clearChunkSurfaceProfileEdit(state, chunkBounds) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    for (let chunkRow = chunkBounds.startRow; chunkRow <= chunkBounds.endRow; chunkRow++)
        for (let chunkCol = chunkBounds.startCol; chunkCol <= chunkBounds.endCol; chunkCol++) state.obstacleGrid.clearChunkSurfaceProfile(chunkCol, chunkRow, cellsPerChunk);
    commitSurfaceMaterialEdit(state, null);
    return chunkRangeToCellBounds(chunkBounds, cellsPerChunk, state.obstacleGrid.cols, state.obstacleGrid.rows);
}
export function setChunkSurfaceProfileRangeEdit(state, chunkBounds, profileId) {
    const cellsPerChunk = state.worldSurfaces.settings.cellsPerChunk;
    state.obstacleGrid.setChunkSurfaceProfileRange(chunkBounds, profileId, cellsPerChunk);
    commitSurfaceMaterialEdit(state, null);
    return chunkRangeToCellBounds(chunkBounds, cellsPerChunk, state.obstacleGrid.cols, state.obstacleGrid.rows);
}
/** Stamp or replace one floor cell and resync nav topology. */
export function applyFloorCellEdit(state, idx, kind, facingRadians) {
    if (!writeNavFloorCell(state.obstacleGrid, idx, kind, facingRadians)) return null;
    return commitGridNavEdit(state, idx);
}
/** Clear one floor cell and resync nav topology. */
export function clearFloorCellNavEdit(state, idx) {
    if (!clearNavFloorCell(state.obstacleGrid, idx)) return null;
    return commitGridNavEdit(state, idx);
}
/** @param {object} state @param {{ col: number, row: number }[]} cells */
export function commitGridNavEditCells(state, cells) {
    const grid = state.obstacleGrid;
    for (let i = 0; i < cells.length; i++) commitGridNavEdit(state, cells[i].col + cells[i].row * grid.cols);
    return Promise.resolve();
}
