import { mapSettings } from "../../Config/Config.js";
import { bakeGameMapWallCache, bakeLabMapWallCache } from "./MapWallCache.js";
import { bakeMapPathDebugCache } from "./MapPathDebugCache.js";

export function buildMapRenderCaches(state) {
    const { x: baseSpawnX, y: baseSpawnY } = state.getMapSpawnOrigin();
    const scale = mapSettings.nodeWorldCoordScale;

    state.mapWallCache = bakeGameMapWallCache(state.walls, baseSpawnX, baseSpawnY, scale);

    const grid = state.obstacleGrid;
    state.mapLabWallCache = grid
        ? bakeLabMapWallCache(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY)
        : null;

    state.mapPathDebugCache = bakeMapPathDebugCache(state);
}
