import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { rebuildLabMapCaches } from "../Render/map/labMapCaches.js";
import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { gridCellToGlobalColRow } from "../World/wallGridCells.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { syncBoundaryNavIndex } from "./boundaryNavIndex.js";
import { unlinkPortalEdge } from "./portalLinks.js";
/** @param {object} state @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} bounds */
export function notifyGridWallChange(state, bounds) {
    state.obstacleGrid.bumpWallGridRevision();
    state.worldSurfaces.invalidateGridBounds(bounds, state);
    state.navigation.onObstaclesChanged(bounds);
    rebuildLabMapCaches(state);
    markGridZoneSubscriptionsDirty(state);
}
/**
 * @param {object} state
 * @param {{ startCol: number, endCol: number, startRow: number, endRow: number }} bounds
 * @param {{ power?: boolean, nav?: boolean }} [opts] — power sync also rebuilds boundary nav hops
 */
export function commitBoundaryEdit(state, bounds, { power = false, nav = false } = {}) {
    notifyGridWallChange(state, bounds);
    if (power) syncPassagePowerNetwork(state);
    else if (nav) syncBoundaryNavIndex(state);
}
/** Same as commitBoundaryEdit but notifies each region before one optional sync pass. */
export function commitBoundaryEditRegions(state, regions, { power = false, nav = false } = {}) {
    for (let i = 0; i < regions.length; i++) notifyGridWallChange(state, regions[i]);
    if (power) syncPassagePowerNetwork(state);
    else if (nav) syncBoundaryNavIndex(state);
}
/**
 * Clear whichever primary boundary occupies a slot (railWall, forcefield, portal).
 * @returns {"railWall" | "passage" | "portal" | false}
 */
export function clearPrimaryBoundaryAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, col, row, side);
    if (!boundary.primary) return false;
    if (boundary.primary === "railWall") {
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        state.staticCellHealth.delete(packEdgeCellKey(globalCol, globalRow, side));
    } else if (boundary.primary === "portal") unlinkPortalEdge(grid, col, row, side);
    clearBoundaryPrimary(grid, col, row, side);
    return boundary.primary;
}
