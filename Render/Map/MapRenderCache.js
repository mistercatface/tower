import { getNodeWorldCoordScale } from "../../Core/GamePorts.js";
import { bakeGameMapWallCache, bakeLabMapWallCache } from "./MapWallCache.js";
import { bakeMapPathDebugCache } from "./MapPathDebugCache.js";
export function buildMapRenderCaches(state) {
    const { x: baseSpawnX, y: baseSpawnY } = state.getMapSpawnOrigin();
    const scale = getNodeWorldCoordScale();
    state.mapWallCache = scale > 0 ? bakeGameMapWallCache(state.walls, baseSpawnX, baseSpawnY, scale) : null;
    const grid = state.obstacleGrid;
    state.mapLabWallCache = grid ? bakeLabMapWallCache(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY) : null;
    state.mapPathDebugCache = bakeMapPathDebugCache(state);
}
