export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, zLevel = 0) {
    return `chunk:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function groundChunkWorkerDedupeKey(payload, profileRevision) {
    return `${groundChunkCachePrefix(payload.chunkCol, payload.chunkRow, payload.profileId, profileRevision, payload.zLevel ?? 0)}:${payload.seed ?? 0}`;
}
export function horizontalPatchWorkerDedupeKey(payload, profileRevision) {
    const zTag = horizontalZCacheTag(payload.zLevel);
    return `patch:${profileRevision}:${payload.profileId}:${zTag}:${payload.originX.toFixed(1)},${payload.originY.toFixed(1)}:${payload.worldWidth.toFixed(1)}x${payload.worldHeight.toFixed(1)}:${payload.seed ?? 0}`;
}
export function staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel) {
    return `staticRoofMask:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function staticRoofDrawCachePrefix(chunkCol, chunkRow, profileId, profileRevision, zLevel) {
    return `staticRoofDraw:${groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, zLevel)}`;
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
    const { chunkCol, chunkRow, minX, minY, seed, profileId, centerX, centerY, zLevel } = payload;
    return { chunkCol, chunkRow, minX, minY, seed, profileId, centerX, centerY, zLevel: zLevel ?? 0 };
}
