import { defaultFloorProceduralProfileId } from "../../Config/floorProceduralConfig.js";
import { getTexturePixelsPerWorldUnit } from "./floorTextureResolution.js";

/** Bump when profile motif stacks change so chunk caches rebake. */
const FLOOR_TEXTURE_CACHE_REVISION = 9;

export function getFloorTextureProfileId(state) {
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

export function floorChunkCacheKey(chunkCol, chunkRow, profileId) {
    return `${FLOOR_TEXTURE_CACHE_REVISION}:${getTexturePixelsPerWorldUnit()}:${profileId}:${chunkCol},${chunkRow}`;
}

export function floorCellCacheKey(col, row, profileId) {
    return `${FLOOR_TEXTURE_CACHE_REVISION}:${getTexturePixelsPerWorldUnit()}:${profileId}:c:${col},${row}`;
}
