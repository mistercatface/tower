import { getAnimationFrames } from "../ProfileBakeResolver.js";
/** @typedef {import("../WorldSurfaceSettings.js").WorldSurfaceSettings} WorldSurfaceSettings */
/**
 * @typedef {Object} GroundChunkBakePayload
 * @property {number} chunkCol
 * @property {number} chunkRow
 * @property {number} minX
 * @property {number} minY
 * @property {number} seed
 * @property {string} profileId
 * @property {number} [zLevel]
 * @property {number} [cellsPerChunk]
 * @property {number} [cellSize]
 * @property {number} [surfaceBakeScale]
 */
/**
 * @param {object | null | undefined} profile
 * @param {WorldSurfaceSettings} settings
 */
export function resolveAnimationBakeFrameCounts(profile, settings) {
    const sourceTotal = getAnimationFrames(profile?.animation);
    const cap = settings.animationBakeMaxFrames;
    const bakeTotal = cap != null && cap > 0 ? Math.min(sourceTotal, Math.floor(cap)) : sourceTotal;
    return { sourceTotal, bakeTotal };
}
export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, surfaceBakeScale, zLevel = 0) {
    return `chunk:${profileRevision}:${surfaceBakeScale}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel) {
    return `staticRoofMask:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function staticRoofDrawCachePrefix(chunkCol, chunkRow, profileId, profileRevision, surfaceBakeScale, zLevel) {
    return `staticRoofDraw:${groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, surfaceBakeScale, zLevel)}`;
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
    const { chunkCol, chunkRow, minX, minY, seed, profileId, zLevel, cellsPerChunk, cellSize, surfaceBakeScale } = payload;
    const result = { chunkCol, chunkRow, minX, minY, seed, profileId, zLevel: zLevel ?? 0 };
    if (cellsPerChunk != null) result.cellsPerChunk = cellsPerChunk;
    if (cellSize != null) result.cellSize = cellSize;
    if (surfaceBakeScale != null) result.surfaceBakeScale = surfaceBakeScale;
    return result;
}
