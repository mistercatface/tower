export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCachePrefix(chunkCol, chunkRow, profileId, profileRevision, zLevel = 0) {
    return `chunk:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function groundChunkWorkerDedupeKey(payload, profileRevision) {
    return `${groundChunkCachePrefix(payload.chunkCol, payload.chunkRow, payload.profileId, profileRevision, payload.zLevel ?? 0)}:${payload.seed ?? 0}`;
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
export function wallAtlasWorkerDedupeKey(payload, profileRevision) {
    const p1 = payload.p1;
    const p2 = payload.p2;
    return `wall:${profileRevision}:${payload.profileId}:${p1.x.toFixed(1)},${p1.y.toFixed(1)}-${p2.x.toFixed(1)},${p2.y.toFixed(1)}:${payload.width}x${payload.height}:${payload.wallHeight ?? 0}:${payload.seed ?? 0}`;
}
