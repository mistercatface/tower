/** @typedef {import("../../GameState/GameState.js").GameState} GameState */

import { getFloorTextureProfileIdForCoords } from "../Floor/floorTextureProfile.js";

/**
 * Context for procedural wall-face baking and texture lookup.
 *
 * @typedef {Object} FloorBakeContext
 * @property {number} floorTileSeed
 * @property {number} gameTime
 * @property {string|null} floorTextureProfileOverride
 * @property {(x: number, y: number) => string} resolveProfileAt
 * @property {number} obstacleCellSize
 */

/**
 * Narrow snapshot for world-space 3D rendering.
 *
 * @typedef {Object} WorldRenderInput
 * @property {{ x: number, y: number }} viewer
 * @property {object[]} walls
 * @property {object|null} wallSpatialHash
 * @property {object[]} pickups
 * @property {{ width: number, height: number }|null} canvasBounds
 * @property {import("../Floor/FloorTileSystem.js").FloorTileSystem} floorTiles
 * @property {FloorBakeContext} floorBake
 */

/**
 * @param {GameState} state
 * @returns {WorldRenderInput}
 */
export function buildWorldRenderInput(state) {
    return {
        viewer: { x: state.player.x, y: state.player.y },
        walls: state.walls,
        wallSpatialHash: state.wallSpatialHash ?? null,
        pickups: state.pickups ?? [],
        canvasBounds: state.canvasBounds ?? null,
        floorTiles: state.floorTiles,
        floorBake: {
            floorTileSeed: state.floorTileSeed ?? 0,
            gameTime: state.gameTime ?? 0,
            floorTextureProfileOverride: state.floorTextureProfileOverride ?? null,
            resolveProfileAt: (x, y) => getFloorTextureProfileIdForCoords(state, x, y),
            obstacleCellSize: state.obstacleGrid?.cellSize ?? 16,
        },
    };
}
