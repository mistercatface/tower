import { defaultFloorProceduralProfileId } from "../../Config/floorProceduralConfig.js";

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
    return `${profileId}:${chunkCol},${chunkRow}`;
}

export function floorCellCacheKey(col, row, profileId) {
    return `${profileId}:c:${col},${row}`;
}
