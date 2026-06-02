import { gridSettings } from "../../Config/Config.js";
import { defaultFloorProceduralProfileId, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { getPixelsPerWorldUnit } from "./floorTextureResolution.js";

/** Bump when profile motif stacks change so chunk caches rebake. */
const FLOOR_TEXTURE_CACHE_REVISION = 14;

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

/** Motif param path that receives player world position (e.g. concentricRings offset). */
export function getPlayerAnchorPath(profile) {
    if (!profile) {
        return null;
    }
    if (typeof profile.playerAnchorPath === "string") {
        return profile.playerAnchorPath;
    }
    const motifs = profile.motifs;
    if (!Array.isArray(motifs)) {
        return null;
    }
    for (let i = 0; i < motifs.length; i++) {
        const motif = motifs[i];
        if (motif?.type === "concentricRings" && motif.followPlayer !== false) {
            return `motifs[${i}].offset`;
        }
    }
    return null;
}

export function quantizePlayerForBake(player, stepPx = gridSettings.cellSize) {
    return {
        x: Math.round(player.x / stepPx) * stepPx,
        y: Math.round(player.y / stepPx) * stepPx,
    };
}

export function floorChunkCacheKey(chunkCol, chunkRow, profileId, playerQuant = null) {
    let key = `${FLOOR_TEXTURE_CACHE_REVISION}:${getPixelsPerWorldUnit()}:${profileId}:${chunkCol},${chunkRow}`;
    if (playerQuant) {
        key += `:p${playerQuant.x},${playerQuant.y}`;
    }
    return key;
}

/** Worker-serializable chunk bake payload from live game state. */
export function buildFloorChunkBakePayload(state, chunkCol, chunkRow) {
    const profileId = getFloorTextureProfileId(state);
    const profile = getFloorProceduralProfile(profileId);
    const playerAnchorPath = getPlayerAnchorPath(profile);

    const payload = {
        chunkCol,
        chunkRow,
        minX: state.obstacleGrid.minX,
        minY: state.obstacleGrid.minY,
        seed: state.floorTileSeed ?? 0,
        profileId,
    };

    if (profile.animation) {
        payload.gameTime = state.gameTime ?? 0;
    }

    if (playerAnchorPath && state.player) {
        payload.playerAnchorPath = playerAnchorPath;
        payload.player = quantizePlayerForBake(state.player);
    }

    return payload;
}
