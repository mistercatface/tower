/** @typedef {import("../../GameState/GameState.js").GameState} GameState */

import { resolveSurfaceProfileAtCoords } from "../game/surfaceProfileResolver.js";

/**
 * Context for procedural wall-face baking and texture lookup.
 *
 * @typedef {Object} SurfaceBakeContext
 * @property {number} surfaceSeed
 * @property {number} gameTime
 * @property {string|null} surfaceProfileOverride
 * @property {(x: number, y: number) => string} resolveProfileAt
 * @property {number} obstacleCellSize
 */

/**
 * Narrow snapshot for world-space 3D rendering.
 *
 * @typedef {Object} WorldRenderInput
 * @property {{ x: number, y: number }} viewer
 * @property {object[]} walls
 * @property {object|null} wallSpatialIndex
 * @property {object[]} pickups
 * @property {{ width: number, height: number }|null} canvasBounds
 * @property {import("../WorldSurface/WorldSurfaceSystem.js").WorldSurfaceSystem} worldSurfaces
 * @property {SurfaceBakeContext} surfaceBake
 */

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
