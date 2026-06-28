import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
/** Clear whichever primary boundary occupies a slot (railWall or forcefield). */
export function clearPrimaryBoundaryAt(state, idx, side, { bumpRevision = false } = {}) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, idx, side);
    if (!boundary.primary) return false;
    clearBoundaryPrimary(grid, idx, side, { bumpRevision });
    return boundary.primary;
}
