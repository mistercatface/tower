import { floorTileSettings } from "../../Config/Config.js";
import { getFloorProfileProvider } from "../../Libraries/Procedural/FloorProfileProvider.js";
import { getAnimationFrames } from "./ProfileBakeResolver.js";
import { getPixelsPerWorldUnit } from "./floorTextureResolution.js";
import { getProfileRevision } from "./TileWorkerCoordinator.js";

export function isFloorChunkAnimationEnabled(profile) {
    return Boolean(profile?.animation) && floorTileSettings.floorAnimationsOn !== false;
}

export function isWallFaceAnimationEnabled(profile) {
    return Boolean(profile?.animation) && floorTileSettings.wallAnimationsOn !== false;
}

export function getFloorChunkAnimationInfo(profile) {
    const enabled = isFloorChunkAnimationEnabled(profile);
    return {
        enabled,
        totalFrames: enabled ? getAnimationFrames(profile.animation) : 1,
    };
}

export function getWallFaceAnimationInfo(profile) {
    const enabled = isWallFaceAnimationEnabled(profile);
    return {
        enabled,
        totalFrames: enabled ? getAnimationFrames(profile.animation) : 1,
    };
}

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

export function floorChunkCachePrefix(chunkCol, chunkRow, profileId) {
    const rev = getProfileRevision(profileId);
    return `chunk:${rev}:${getPixelsPerWorldUnit()}:${profileId}:${chunkCol},${chunkRow}`;
}

/** Worker-serializable chunk bake payload from live game state. */
export function buildFloorChunkBakePayload(state, chunkCol, chunkRow) {
    const obstacleGrid = state.obstacleGrid;
    const cellsPerChunk = floorTileSettings.cellsPerChunk;
    const chunkSizePx = obstacleGrid.cellSize * cellsPerChunk;
    const chunkCenterX = obstacleGrid.minX + chunkCol * chunkSizePx + chunkSizePx / 2;
    const chunkCenterY = obstacleGrid.minY + chunkRow * chunkSizePx + chunkSizePx / 2;

    const profileId = getFloorTextureProfileIdForCoords(state, chunkCenterX, chunkCenterY);
    const profile = getFloorProfileProvider().getProfile(profileId);

    const payload = { chunkCol, chunkRow, minX: state.obstacleGrid.minX, minY: state.obstacleGrid.minY, seed: state.floorTileSeed ?? 0, profileId };

    if (isFloorChunkAnimationEnabled(profile)) {
        payload.gameTime = state.gameTime ?? 0;
    }

    return payload;
}
