import { getWorldSurfaceSettings } from "../../Libraries/WorldSurface/WorldSurfaceSettings.js";
import {
    createFloorChunkBakePayload,
    isFloorChunkAnimationEnabled,
} from "../../Libraries/WorldSurface/bake/FloorBakeHelpers.js";
import { getFloorProfileProvider } from "../../Libraries/Procedural/FloorProfileProvider.js";

/** @typedef {import("../../GameState/GameState.js").GameState} GameState */

export function getFloorTextureProfileIdForCoords(state, x, y) {
    if (state.floorTextureProfileOverride) {
        return state.floorTextureProfileOverride;
    }
    let closestNode = null;
    let minDist = Infinity;
    for (const node of state.mapNodes) {
        const coords = state.getNodeCombatCoords(node);
        const dist = Math.hypot(x - coords.x, y - coords.y);
        if (dist < minDist) {
            minDist = dist;
            closestNode = node;
        }
    }
    if (closestNode?.floorTextureProfileId) {
        return closestNode.floorTextureProfileId;
    }
    return getFloorProfileProvider().defaultId;
}

export function getFloorTextureProfileId(state) {
    return getFloorTextureProfileIdForCoords(state, state.player.x, state.player.y);
}

/** Apply active node profile to the floor cache; clears baked tiles when the profile changes. */
export function syncFloorTextureProfile(state) {
    const profileId = getFloorTextureProfileId(state);
    if (state.floorTiles.proceduralProfileId === profileId) {
        return;
    }
    state.floorTiles.proceduralProfileId = profileId;
    // state.floorTiles.clear(); // Disabled for mega-map chunk rendering
}

/** Worker-serializable chunk bake payload from live game state. */
export function buildFloorChunkBakePayload(state, chunkCol, chunkRow) {
    const obstacleGrid = state.obstacleGrid;
    const cellsPerChunk = getWorldSurfaceSettings().cellsPerChunk;
    const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
    const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
    const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;

    const profileId = getFloorTextureProfileIdForCoords(state, chunkCenterX, chunkCenterY);
    const profile = getFloorProfileProvider().getProfile(profileId);

    return createFloorChunkBakePayload({
        chunkCol,
        chunkRow,
        minX: obstacleGrid.minX,
        minY: obstacleGrid.minY,
        seed: state.floorTileSeed ?? 0,
        profileId,
        gameTime: isFloorChunkAnimationEnabled(profile) ? (state.gameTime ?? 0) : undefined,
    });
}
