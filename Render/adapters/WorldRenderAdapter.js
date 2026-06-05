/** @typedef {import("../../GameState/GameState.js").GameState} GameState */

/**
 * Narrow snapshot for world-space 3D rendering.
 * `scene` remains until wall textures and entity draw hooks are fully decoupled.
 *
 * @typedef {Object} WorldRenderInput
 * @property {{ x: number, y: number }} viewer
 * @property {object[]} walls
 * @property {object|null} wallSpatialHash
 * @property {object[]} pickups
 * @property {{ width: number, height: number }|null} canvasBounds
 * @property {object} floorTiles
 * @property {GameState} scene
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
        scene: state,
    };
}
