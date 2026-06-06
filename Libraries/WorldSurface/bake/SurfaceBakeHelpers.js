/** @typedef {import("../WorldSurfaceSettings.js").WorldSurfaceSettings} WorldSurfaceSettings */

/**
 * @typedef {Object} GroundChunkBakePayload
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} minX
 * @property {number} minY
 * @property {number} seed
 * @property {string} profileId
 * @property {number} [gameTime]
 * @property {number} [cellsPerChunk]
 * @property {number} [cellSize]
 * @property {number} [tileResolution]
 * @property {number} [tileWorldSize]
 */

function countAnimationFrames(animation) {
    if (!animation) return 1;
    const stages = animation.stages || [];
    return stages.reduce((sum, stage) => sum + (stage.frames ?? 30), 0) || 1;
}

/**
 * @param {object | null | undefined} profile
 * @param {WorldSurfaceSettings} settings
 */
export function resolveAnimationBakeFrameCounts(profile, settings) {
    const sourceTotal = countAnimationFrames(profile?.animation);
    const cap = settings.animationBakeMaxFrames;
    const bakeTotal =
        cap != null && cap > 0 ? Math.min(sourceTotal, Math.floor(cap)) : sourceTotal;
    return { sourceTotal, bakeTotal };
}

/** @param {WorldSurfaceSettings} settings */
export function isGroundChunkAnimationEnabled(profile, settings) {
    return Boolean(profile?.animation) && settings.groundChunkAnimationsOn !== false;
}

/** @param {WorldSurfaceSettings} settings */
export function isWallAtlasAnimationEnabled(profile, settings) {
    return Boolean(profile?.animation) && settings.wallAnimationsOn !== false;
}

/** @param {WorldSurfaceSettings} settings */
export function getGroundChunkAnimationInfo(profile, settings) {
    const enabled = isGroundChunkAnimationEnabled(profile, settings);
    if (!enabled) {
        return { enabled, totalFrames: 1, sourceTotal: 1 };
    }
    const { sourceTotal, bakeTotal } = resolveAnimationBakeFrameCounts(profile, settings);
    return { enabled, totalFrames: bakeTotal, sourceTotal };
}

/** @param {WorldSurfaceSettings} settings */
export function getWallAtlasAnimationInfo(profile, settings) {
    const enabled = isWallAtlasAnimationEnabled(profile, settings);
    if (!enabled) {
        return { enabled, totalFrames: 1, sourceTotal: 1 };
    }
    const { sourceTotal, bakeTotal } = resolveAnimationBakeFrameCounts(profile, settings);
    return { enabled, totalFrames: bakeTotal, sourceTotal };
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
    const { chunkCol, chunkRow, minX, minY, seed, profileId, gameTime, cellsPerChunk, cellSize, tileResolution, tileWorldSize } = payload;
    const result = { chunkCol, chunkRow, minX, minY, seed, profileId };
    if (gameTime != null) result.gameTime = gameTime;
    if (cellsPerChunk != null) result.cellsPerChunk = cellsPerChunk;
    if (cellSize != null) result.cellSize = cellSize;
    if (tileResolution != null) result.tileResolution = tileResolution;
    if (tileWorldSize != null) result.tileWorldSize = tileWorldSize;
    return result;
}
