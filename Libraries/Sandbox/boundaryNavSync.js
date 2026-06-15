import { buildBoundaryNavHops } from "../Pathfinding/boundaryNavHops.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
/** @param {object} state */
export function syncBoundaryNavIndex(state) {
    const grid = state.obstacleGrid;
    if (!grid.edgeStore.portalEdgeCount) {
        grid.boundaryNavHops = new Map();
        return;
    }
    grid.boundaryNavHops = buildBoundaryNavHops(grid, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalStepEntry(state, g, mouthCol, mouthRow, backCol, backRow));
    state.hierarchicalNavigator?.connectBoundaryHopRegionPairs?.();
}
