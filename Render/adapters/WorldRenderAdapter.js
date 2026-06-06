/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").SurfaceBakeContext} SurfaceBakeContext */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} WorldRenderInput */
import { getActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { resolvePerspectiveConfig } from "../../Core/GamePerspective.js";
import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";
/**
 * @param {GameState} state
 * @param {{ x: number, y: number } | null | undefined} [viewport]
 * @returns {{ x: number, y: number }}
 */
export function resolveRenderViewer(state, viewport) {
    const { viewerSource } = resolvePerspectiveConfig(getActiveGameDefinition());
    if (viewerSource === "viewport" && viewport) return { x: viewport.x, y: viewport.y };
    return { x: state.player.x, y: state.player.y };
}
/**
 * @param {GameState} state
 * @param {{ x: number, y: number } | null | undefined} [viewport]
 * @returns {WorldRenderInput}
 */
export function buildWorldRenderInput(state, viewport = null) {
    return {
        viewer: resolveRenderViewer(state, viewport),
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
