import { getWorldSurfaceSettings } from "../WorldSurfaceSettings.js";

/**
 * @typedef {Object} FloorChunkBakePayload
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

export function isFloorChunkAnimationEnabled(profile, settings = getWorldSurfaceSettings()) {
    return Boolean(profile?.animation) && settings.floorAnimationsOn !== false;
}

export function isWallFaceAnimationEnabled(profile, settings = getWorldSurfaceSettings()) {
    return Boolean(profile?.animation) && settings.wallAnimationsOn !== false;
}

export function getFloorChunkAnimationInfo(profile, settings = getWorldSurfaceSettings()) {
    const enabled = isFloorChunkAnimationEnabled(profile, settings);
    return {
        enabled,
        totalFrames: enabled ? countAnimationFrames(profile.animation) : 1,
    };
}

export function getWallFaceAnimationInfo(profile, settings = getWorldSurfaceSettings()) {
    const enabled = isWallFaceAnimationEnabled(profile, settings);
    return {
        enabled,
        totalFrames: enabled ? countAnimationFrames(profile.animation) : 1,
    };
}

export function floorChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, pixelsPerWorldUnit) {
    return `chunk:${profileRevision}:${pixelsPerWorldUnit}:${profileId}:${chunkCol},${chunkRow}`;
}

/**
 * Worker-serializable floor-chunk bake payload (profile already resolved by caller).
 * @param {FloorChunkBakePayload} payload
 * @returns {FloorChunkBakePayload}
 */
export function createFloorChunkBakePayload(payload) {
    const { chunkCol, chunkRow, minX, minY, seed, profileId, gameTime } = payload;
    const result = { chunkCol, chunkRow, minX, minY, seed, profileId };
    if (gameTime != null) {
        result.gameTime = gameTime;
    }
    return result;
}
