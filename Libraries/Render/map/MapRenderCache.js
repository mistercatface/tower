import { bakeTopologyMapWallCache } from "./MapWallCache.js";
/** Topology view wall bake (world-space, full grid). */
export function buildTopologyMapRenderCaches(state) {
    const grid = state.obstacleGrid;
    state.mapTopologyWallCache = grid ? bakeTopologyMapWallCache(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY) : null;
}
