import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
/** Clear whichever primary boundary occupies a slot (railWall or forcefield). */
export function clearPrimaryBoundaryAt(state, col, row, side, { bumpRevision = false } = {}) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, col, row, side);
    if (!boundary.primary) return false;
    clearBoundaryPrimary(grid, col, row, side, { bumpRevision });
    return boundary.primary;
}
