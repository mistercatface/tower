import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { colRowToIndex } from "../Spatial/grid/GridUtils.js";
/** Clear whichever primary boundary occupies a slot (railWall or forcefield). */
export function clearPrimaryBoundaryAt(state, col, row, side, { bumpRevision = false } = {}) {
    const grid = state.obstacleGrid;
    const idx = colRowToIndex(col, row, grid.cols);
    const boundary = getBoundary(grid, idx, side);
    if (!boundary.primary) return false;
    clearBoundaryPrimary(grid, idx, side, { bumpRevision });
    return boundary.primary;
}
