import { unionCellBounds } from "../DataStructures/CellRect.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { clearBoundaryPrimary, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
export function notifyGridWallChange(state, bounds, { fullNavSync = false } = {}) {
    return commitGridNavEdit(state, bounds, { fullNavSync, bumpWall: true });
}
export function commitBoundaryEdit(state, bounds, { power = false } = {}) {
    if (power) return syncPassagePowerNetwork(state);
    if (!bounds) return;
    const regions = Array.isArray(bounds) ? bounds : [bounds];
    if (!regions.length) return;
    let merged = regions[0];
    for (let i = 1; i < regions.length; i++) merged = unionCellBounds(merged, regions[i]);
    return commitGridNavEdit(state, merged, { bumpWall: true });
}
/** Clear whichever primary boundary occupies a slot (railWall or forcefield). */
export function clearPrimaryBoundaryAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    const boundary = getBoundary(grid, col, row, side);
    if (!boundary.primary) return false;
    clearBoundaryPrimary(grid, col, row, side);
    return boundary.primary;
}
