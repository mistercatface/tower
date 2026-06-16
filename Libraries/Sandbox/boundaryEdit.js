import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch } from "../Spatial/grid/gridNavEpoch.js";
import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
export function notifyGridWallChange(state, bounds, { fullNavSync = false } = {}) {
    bumpGridNavEpoch(state.obstacleGrid, GRID_NAV_EPOCH.Wall);
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    const navPromise = state.navigation.onObstaclesChanged(fullNavSync ? null : bounds);
    rebuildLabMapCaches(state);
    markGridZoneSubscriptionsDirty(state);
    return navPromise;
}
export function commitBoundaryEdit(state, bounds, { power = false } = {}) {
    const regions = Array.isArray(bounds) ? bounds : [bounds];
    if (power) return syncPassagePowerNetwork(state);
    for (let i = 0; i < regions.length; i++) notifyGridWallChange(state, regions[i]);
}
/** Clear whichever primary boundary occupies a slot (railWall or forcefield). */
export function clearPrimaryBoundaryAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, col, row, side);
    if (!boundary.primary) return false;
    clearBoundaryPrimary(grid, col, row, side);
    return boundary.primary;
}
