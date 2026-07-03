import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
/** Clear whichever primary boundary occupies a slot (railWall). */
export function clearPrimaryBoundaryAt(state, idx, side, bumpRevision = false) {
    const grid = state.obstacleGrid;
    if (!getBoundary(grid, idx, side)) return false;
    clearBoundaryPrimary(grid, idx, side, bumpRevision);
    return "railWall";
}
