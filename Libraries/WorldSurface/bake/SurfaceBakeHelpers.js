import { getWorldSurfaceSettings } from "../WorldSurfaceSettings.js";

/**
 * @typedef {Object} GroundChunkBakePayload
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} minX
 * @property {number} minY
 * @property {number} seed
 * @property {string} profileId
 * @property {number} [gameTime]
 */

function countAnimationFrames(animation) {
    if (!animation) return 1;
    const stages = animation.stages || [];
    return stages.reduce((sum, stage) => sum + (stage.frames ?? 30), 0) || 1;
}

export function isGroundChunkAnimationEnabled(profile, settings = getWorldSurfaceSettings()) {
    return Boolean(profile?.animation) && settings.groundChunkAnimationsOn !== false;
}

export function isWallAtlasAnimationEnabled(profile, settings = getWorldSurfaceSettings()) {
    return Boolean(profile?.animation) && settings.wallAnimationsOn !== false;
}

export function getGroundChunkAnimationInfo(profile, settings = getWorldSurfaceSettings()) {
    const enabled = isGroundChunkAnimationEnabled(profile, settings);
    return {
        enabled,
        totalFrames: enabled ? countAnimationFrames(profile.animation) : 1,
    };
}

export function getWallAtlasAnimationInfo(profile, settings = getWorldSurfaceSettings()) {
    const enabled = isWallAtlasAnimationEnabled(profile, settings);
    return {
        enabled,
        totalFrames: enabled ? countAnimationFrames(profile.animation) : 1,
    };
}

export function groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, pixelsPerWorldUnit) {
    return `chunk:${profileRevision}:${pixelsPerWorldUnit}:${profileId}:${chunkCol},${chunkRow}`;
}

/**
 * Worker-serializable ground-chunk bake payload (profile already resolved by caller).
 * @param {GroundChunkBakePayload} payload
 * @returns {GroundChunkBakePayload}
 */
export function createGroundChunkBakePayload(payload) {
    const { chunkCol, chunkRow, minX, minY, seed, profileId, gameTime } = payload;
    const result = { chunkCol, chunkRow, minX, minY, seed, profileId };
    if (gameTime != null) {
        result.gameTime = gameTime;
    }
    return result;
}
