/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} WorldRenderInput */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").ProceduralSurfaceDrawContext} ProceduralSurfaceDrawContext */
import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";
/** @returns {ProceduralSurfaceDrawContext} */
export function createProceduralSurfaceDrawContext() {
    return {
        surfaceSeed: 0,
        gameTime: 0,
        surfaceProfileOverride: null,
        obstacleCellSize: 0,
        _gameState: null,
        resolveProfileAt(x, y) {
            return resolveSurfaceProfileAtCoords(this._gameState, x, y);
        },
    };
}
/** @returns {WorldRenderInput} */
export function createWorldSceneDrawInput() {
    return { walls: [], pickups: [], ragdollCorpses: [], worldSurfaces: null, proceduralSurfaceDraw: createProceduralSurfaceDrawContext() };
}
/**
 * Refresh references and per-frame scalars — reuses the same draw-input shell each frame.
 *
 * @param {WorldRenderInput} input
 * @param {GameState} state
 */
export function syncWorldSceneDrawInput(input, state) {
    input.walls = state.walls;
    input.pickups = state.pickups;
    input.ragdollCorpses = state.ragdollCorpses ?? [];
    input.worldSurfaces = state.worldSurfaces;
    const surfaceDraw = input.proceduralSurfaceDraw;
    surfaceDraw._gameState = state;
    surfaceDraw.surfaceSeed = state.worldSurfaces.worldSurfaceSeed ?? 0;
    surfaceDraw.gameTime = state.gameTime;
    surfaceDraw.surfaceProfileOverride = state.worldSurfaces.surfaceProfileOverride ?? null;
    surfaceDraw.obstacleCellSize = state.obstacleGrid.cellSize;
}
