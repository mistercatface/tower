import { buildBoundaryNavHops } from "../Pathfinding/boundaryNavHops.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
import { stampPassageNetworkIdsOnGrid } from "../Pathfinding/navSimHopBake.js";
export function syncBoundaryNavIndex(state) {
    const grid = state.obstacleGrid;
    grid.boundaryNavEpoch = (grid.boundaryNavEpoch + 1) | 0;
    grid.boundaryNavHops = null;
    if (!grid.edgeStore.portalEdgeCount) grid.boundaryNavHops = new Map();
    grid.invalidateGridNavSnapshot();
}
/** Lazy main-thread hop table for steering, overlay, and grid.canBoundaryHop. */
export function ensureBoundaryNavHops(state) {
    const grid = state.obstacleGrid;
    stampPassageNetworkIdsOnGrid(grid);
    if (grid.boundaryNavHops) return grid.boundaryNavHops;
    if (!grid.edgeStore.portalEdgeCount) {
        grid.boundaryNavHops = new Map();
        return grid.boundaryNavHops;
    }
    grid.boundaryNavHops = buildBoundaryNavHops(grid, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalStepEntry(state, g, mouthCol, mouthRow, backCol, backRow));
    return grid.boundaryNavHops;
}
