import { defaultFloorProceduralProfileId, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { getPixelsPerWorldUnit } from "./floorTextureResolution.js";
import { getProfileRevision } from "./TileWorkerCoordinator.js";

export function getFloorTextureProfileId(state) {
    if (state.floorTextureProfileOverride) {
        return state.floorTextureProfileOverride;
    }
    const node = state.getCurrentMapNode();
    if (node?.floorTextureProfileId) {
        return node.floorTextureProfileId;
    }
    return defaultFloorProceduralProfileId;
}

/** Apply active node profile to the floor cache; clears baked tiles when the profile changes. */
export function syncFloorTextureProfile(state) {
    const profileId = getFloorTextureProfileId(state);
    if (state.floorTiles.proceduralProfileId === profileId) {
        return;
    }
    state.floorTiles.proceduralProfileId = profileId;
    state.floorTiles.clear();
}

export function floorChunkCachePrefix(chunkCol, chunkRow, profileId) {
    const rev = getProfileRevision(profileId);
    return `${rev}:${getPixelsPerWorldUnit()}:${profileId}:${chunkCol},${chunkRow}`;
}

/** Worker-serializable chunk bake payload from live game state. */
export function buildFloorChunkBakePayload(state, chunkCol, chunkRow) {
    const profileId = getFloorTextureProfileId(state);
    const profile = getFloorProceduralProfile(profileId);

    const payload = { chunkCol, chunkRow, minX: state.obstacleGrid.minX, minY: state.obstacleGrid.minY, seed: state.floorTileSeed ?? 0, profileId };

    if (profile.animation) {
        payload.gameTime = state.gameTime ?? 0;
    }

    return payload;
}
