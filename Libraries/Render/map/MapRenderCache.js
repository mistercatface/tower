import { engine } from "../../../Apps/Editor/engine.js";
import { bakeGameMapWallCache, bakeTopologyMapWallCache } from "./MapWallCache.js";
import { bakeMapPathDebugCache } from "./MapPathDebugCache.js";
/** In-game map screen wall bake (graph-space). */
export function buildGameMapRenderCaches(state) {
    const { x: baseSpawnX, y: baseSpawnY } = state.getMapSpawnOrigin();
    const scale = engine.worldGen.nodeWorldCoordScale;
    state.mapWallCache = scale > 0 ? bakeGameMapWallCache(state.walls, baseSpawnX, baseSpawnY, scale) : null;
    state.mapPathDebugCache = bakeMapPathDebugCache(state);
}
/** Topology view wall bake (world-space, full grid). */
export function buildTopologyMapRenderCaches(state) {
    const grid = state.obstacleGrid;
    state.mapTopologyWallCache = grid ? bakeTopologyMapWallCache(state.walls, grid.minX, grid.minY, grid.maxX, grid.maxY) : null;
}
export function buildMapRenderCaches(state) {
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
}
