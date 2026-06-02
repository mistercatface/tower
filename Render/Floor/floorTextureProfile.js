import { gridSettings } from "../../Config/Config.js";
import { defaultFloorProceduralProfileId, getFloorProceduralProfile } from "../../Config/floorProceduralConfig.js";
import { getPixelsPerWorldUnit } from "./floorTextureResolution.js";

/** Bump when profile motif stacks change so chunk caches rebake. */
const FLOOR_TEXTURE_CACHE_REVISION = 18;

/** @typedef {{ kind: "xy", pathX: string, pathY: string } | { kind: "point", path: string }} PlayerAnchorBinding */

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

/** Resolve player-follow binding for runtime bakes (translate preferred over legacy ring offset). */
export function getPlayerAnchorBinding(profile) {
    if (!profile) {
        return null;
    }
    if (typeof profile.playerAnchorPath === "string") {
        return { kind: "point", path: profile.playerAnchorPath };
    }
    const motifs = profile.motifs;
    if (!Array.isArray(motifs)) {
        return null;
    }
    for (let i = 0; i < motifs.length; i++) {
        const motif = motifs[i];
        if (motif?.type === "translate" && motif.followPlayer === true) {
            return { kind: "xy", pathX: `motifs[${i}].x`, pathY: `motifs[${i}].y` };
        }
    }
    for (let i = 0; i < motifs.length; i++) {
        const motif = motifs[i];
        if (motif?.type === "concentricRings" && motif.followPlayer === true) {
            return { kind: "point", path: `motifs[${i}].offset` };
        }
    }
    return null;
}

/** True when timeline tracks animate a translate layer's X or Y (player follow should not fight it). */
export function profileHasTranslateTimeline(profile) {
    const motifs = profile?.motifs;
    const tracks = profile?.animation?.tracks;
    if (!Array.isArray(motifs) || !Array.isArray(tracks)) {
        return false;
    }
    for (let i = 0; i < motifs.length; i++) {
        if (motifs[i]?.type !== "translate") {
            continue;
        }
        const pathX = `motifs[${i}].x`;
        const pathY = `motifs[${i}].y`;
        for (const track of tracks) {
            if (track.targetPath === pathX || track.targetPath === pathY) {
                return true;
            }
        }
    }
    return false;
}

/** @deprecated Use getPlayerAnchorBinding */
export function getPlayerAnchorPath(profile) {
    const binding = getPlayerAnchorBinding(profile);
    return binding?.kind === "point" ? binding.path : null;
}

export function quantizePlayerForBake(player, stepPx = gridSettings.cellSize) {
    return {
        x: Math.round(player.x / stepPx) * stepPx,
        y: Math.round(player.y / stepPx) * stepPx,
    };
}

export function floorChunkCacheKey(chunkCol, chunkRow, profileId, tetherOrigin = null) {
    let key = `${FLOOR_TEXTURE_CACHE_REVISION}:${getPixelsPerWorldUnit()}:${profileId}:${chunkCol},${chunkRow}`;
    if (tetherOrigin) {
        key += `:t${tetherOrigin.x},${tetherOrigin.y}`;
    }
    return key;
}

/** Worker-serializable chunk bake payload from live game state. */
export function buildFloorChunkBakePayload(state, chunkCol, chunkRow, tetherOrigin = null) {
    const profileId = getFloorTextureProfileId(state);
    const profile = getFloorProceduralProfile(profileId);
    const playerAnchorBinding = getPlayerAnchorBinding(profile);

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

    if (playerAnchorBinding && tetherOrigin && !profileHasTranslateTimeline(profile)) {
        payload.playerAnchorBinding = playerAnchorBinding;
        payload.tetherOrigin = tetherOrigin;
    }

    return payload;
}
