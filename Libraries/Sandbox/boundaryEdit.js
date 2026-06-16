import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { syncBoundaryNavIndex } from "./boundaryNavSync.js";
import { unlinkPortalEdge } from "./portalLinks.js";
export function notifyGridWallChange(state, bounds) {
    state.obstacleGrid.bumpWallGridRevision();
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
    rebuildLabMapCaches(state);
    markGridZoneSubscriptionsDirty(state);
}
export function commitBoundaryEdit(state, bounds, { power = false, nav = false } = {}) {
    const regions = Array.isArray(bounds) ? bounds : [bounds];
    if (nav) syncBoundaryNavIndex(state);
    if (power) {
        void syncPassagePowerNetwork(state);
        return;
    }
    for (let i = 0; i < regions.length; i++) notifyGridWallChange(state, regions[i]);
}
/** Clear whichever primary boundary occupies a slot (railWall, forcefield, portal). */
export function clearPrimaryBoundaryAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, col, row, side);
    if (!boundary.primary) return false;
    if (boundary.primary === "portal") unlinkPortalEdge(grid, col, row, side);
    clearBoundaryPrimary(grid, col, row, side);
    return boundary.primary;
}
