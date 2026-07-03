import { clearBoundaryPrimary, boundaryBlocksStep } from "../Spatial/grid/boundaryOccupancy.js";
/** Clear whichever primary boundary occupies a slot (railWall). */
export function clearPrimaryBoundaryAt(state, idx, side, bumpRevision = false) {
    const grid = state.obstacleGrid;
    if (!boundaryBlocksStep(grid, idx, side)) return false;
    clearBoundaryPrimary(grid, idx, side, bumpRevision);
    return true;
}
