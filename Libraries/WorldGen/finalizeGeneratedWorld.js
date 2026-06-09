import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";
/**
 * Shared post-generation steps after walls are in `state.walls` / spatial index.
 *
 * @param {object} state
 * @param {{ centerX: number, centerY: number, gridBounds?: { centerX: number, centerY: number, width: number, height: number } | null }} focus — hnav + flow-field anchor
 */
export function finalizeGeneratedWorld(state, { centerX, centerY, gridBounds = null }) {
    if (gridBounds) {
        state.obstacleGrid.rebuildFixed(gridBounds.centerX, gridBounds.centerY, gridBounds.width, gridBounds.height);
        state.obstacleGrid.segmentGrid = new Array(state.obstacleGrid.cols * state.obstacleGrid.rows);
        for (const wall of state.walls) state.obstacleGrid.addWall(wall);
    } else state.obstacleGrid.rebuild(state.walls);
    state.hierarchicalNavigator.initialize(centerX, centerY);
    state.worldSurfaceSeed = (Math.random() * 0x7fffffff) | 0;
    state.worldSurfaces.clear();
    state.roofZLevels = null;
    state.roofSpatialIndices = null;
    syncSurfaceProfile(state, centerX, centerY);
}
