/** @typedef {import("../../GameState/GameState.js").GameState} GameState */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").SurfaceBakeContext} SurfaceBakeContext */
/** @typedef {import("../../Libraries/Render/WorldSceneTypes.js").WorldSceneDrawInput} WorldRenderInput */
import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";
/**
 * Billboarding / parallax anchor — always the active camera, never a game actor.
 *
 * @param {GameState} state
 * @param {{ x: number, y: number }} viewport
 * @returns {{ x: number, y: number }}
 */
export function resolveRenderViewer(state, viewport) {
    if (!viewport) throw new Error("resolveRenderViewer: viewport required");
    return { x: viewport.x, y: viewport.y };
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
        ragdollCorpses: state.ragdollCorpses ?? [],
        canvasBounds: state.canvasBounds ?? null,
        worldSurfaces: state.worldSurfaces,
        surfaceBake: {
            surfaceSeed: state.worldSurfaces.worldSurfaceSeed ?? 0,
            gameTime: state.gameTime ?? 0,
            surfaceProfileOverride: state.worldSurfaces.surfaceProfileOverride ?? null,
            resolveProfileAt: (x, y) => resolveSurfaceProfileAtCoords(state, x, y),
            obstacleCellSize: state.obstacleGrid.cellSize,
        },
    };
}
