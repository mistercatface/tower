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
 * @property {number} [zLevel] — world height for horizontal surfaces (0 = ground)
 * @property {number} [cellsPerChunk]
 * @property {number} [cellSize]
 * @property {number} [texelResolution]
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
    const bakeTotal = cap != null && cap > 0 ? Math.min(sourceTotal, Math.floor(cap)) : sourceTotal;
    return { sourceTotal, bakeTotal };
}
export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, pixelsPerWorldUnit, zLevel = 0) {
    return `chunk:${profileRevision}:${pixelsPerWorldUnit}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
/** @param {WorldSurfaceSettings} settings @returns {number[]} */
export function getHorizontalSurfaceZLevels(settings) {
    const roof = settings.roofZLevels ?? [];
    return [0, ...roof.filter((z) => z > 0)];
}
/**
 * Worker-serializable ground-chunk bake payload (profile already resolved by caller).
 * @param {GroundChunkBakePayload} payload
 * @returns {GroundChunkBakePayload}
 */
export function createGroundChunkBakePayload(payload) {
    const { chunkCol, chunkRow, minX, minY, seed, profileId, gameTime, zLevel, cellsPerChunk, cellSize, texelResolution } = payload;
    const result = { chunkCol, chunkRow, minX, minY, seed, profileId, zLevel: zLevel ?? 0 };
    if (gameTime != null) result.gameTime = gameTime;
    if (cellsPerChunk != null) result.cellsPerChunk = cellsPerChunk;
    if (cellSize != null) result.cellSize = cellSize;
    if (texelResolution != null) result.texelResolution = texelResolution;
    return result;
}
