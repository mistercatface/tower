import { getWallCellBounds, unionGridCellRect } from "../Spatial/grid/wallGridBake.js";
import { pointInAabb } from "../Math/Aabb2D.js";
/** @param {object} state @param {object} wall */
function detachSandboxWall(state, wall) {
    const idx = state.walls.indexOf(wall);
    if (idx >= 0) state.walls.splice(idx, 1);
    state.wallSpatialIndex.remove(wall);
    const bounds = state.obstacleGrid.patchAfterWallRemoved(wall, state.wallSpatialIndex);
    if (bounds) state.worldSurfaces.invalidateGridBounds(bounds, state);
    return bounds ?? null;
}
/** @param {object} state @param {object[]} walls @param {{ notifyNavigation?: boolean }} [options] */
export function removeSandboxWalls(state, walls, { notifyNavigation = true } = {}) {
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) damageBounds = unionGridCellRect(damageBounds, detachSandboxWall(state, walls[i]));
    if (damageBounds && notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
}
/** @param {object} state @param {object[]} walls @param {{ notifyNavigation?: boolean }} [options] */
export function addSandboxWalls(state, walls, { notifyNavigation = true } = {}) {
    const grid = state.obstacleGrid;
    let damageBounds = null;
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[i];
        wall.collisionOnly = true;
        state.walls.push(wall);
        state.wallSpatialIndex.insert(wall);
        grid.addWall(wall);
        damageBounds = unionGridCellRect(
            damageBounds,
            getWallCellBounds(wall, (x, y) => grid.worldToGrid(x, y), grid.cols, grid.rows),
        );
    }
    if (damageBounds) {
        state.worldSurfaces.invalidateGridBounds(damageBounds, state);
        if (notifyNavigation) state.navigation.onObstaclesChanged(damageBounds);
    }
}
/** @param {object} state @param {import("../Math/Aabb2D.js").Aabb2D} bounds */
export function clearSandboxWallsInBounds(state, bounds) {
    const candidates = state.wallSpatialIndex.collectInBounds(bounds);
    const toRemove = [];
    for (let i = 0; i < candidates.length; i++) {
        const wall = candidates[i];
        if (wall.isDead || !pointInAabb(wall.x, wall.y, bounds)) continue;
        toRemove.push(wall);
    }
    if (toRemove.length) removeSandboxWalls(state, toRemove);
}
