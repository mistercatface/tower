/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").SurfaceBakeContext} SurfaceBakeContext */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} WorldRenderInput */

import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";

/**
 * @param {GameState} state
 * @returns {WorldRenderInput}
 */
export function buildWorldRenderInput(state) {
    return {
        viewer: { x: state.player.x, y: state.player.y },
        walls: state.walls,
        wallSpatialIndex: state.wallSpatialIndex ?? null,
        pickups: state.pickups ?? [],
        canvasBounds: state.canvasBounds ?? null,
        worldSurfaces: state.worldSurfaces,
        surfaceBake: {
            surfaceSeed: state.worldSurfaceSeed ?? 0,
            gameTime: state.gameTime ?? 0,
            surfaceProfileOverride: state.surfaceProfileOverride ?? null,
            resolveProfileAt: (x, y) => resolveSurfaceProfileAtCoords(state, x, y),
            obstacleCellSize: state.obstacleGrid?.cellSize ?? 16,
        },
    };
}
