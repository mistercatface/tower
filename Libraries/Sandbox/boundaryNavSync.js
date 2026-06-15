import { buildBoundaryNavHops } from "../Pathfinding/boundaryNavHops.js";
import { evaluatePortalStepEntry } from "./portalLinks.js";
export function syncBoundaryNavIndex(state) {
    const grid = state.obstacleGrid;
    grid.boundaryNavEpoch = (grid.boundaryNavEpoch + 1) | 0;
    if (!grid.edgeStore.portalEdgeCount) {
        grid.boundaryNavHops = new Map();
        grid.invalidateGridNavSnapshot();
        return;
    }
    grid.boundaryNavHops = buildBoundaryNavHops(grid, (g, mouthCol, mouthRow, backCol, backRow) => evaluatePortalStepEntry(state, g, mouthCol, mouthRow, backCol, backRow));
    grid.invalidateGridNavSnapshot();
    state.hierarchicalNavigator?.connectBoundaryHopRegionPairs?.();
}
