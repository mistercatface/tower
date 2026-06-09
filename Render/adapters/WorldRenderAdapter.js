/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} WorldRenderInput */
import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";
/**
 * @param {GameState} state
 * @returns {WorldRenderInput}
 */
export function buildWorldRenderInput(state) {
    return {
        walls: state.walls,
        pickups: state.pickups,
        ragdollCorpses: state.ragdollCorpses ?? [],
        worldSurfaces: state.worldSurfaces,
        surfaceBake: {
            surfaceSeed: state.worldSurfaces.worldSurfaceSeed ?? 0,
            gameTime: state.gameTime,
            surfaceProfileOverride: state.worldSurfaces.surfaceProfileOverride ?? null,
            resolveProfileAt: (x, y) => resolveSurfaceProfileAtCoords(state, x, y),
            obstacleCellSize: state.obstacleGrid.cellSize,
        },
    };
}
