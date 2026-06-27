import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
export function horizontalZCacheTag(zLevel = 0) {
    return zLevel > 0 ? `z${zLevel}roof` : `z${zLevel}`;
}
export function groundChunkCacheKey(chunkCol, chunkRow, profileId, profileRevision, zLevel = 0) {
    return `chunk:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function staticRoofMaskCacheKey(chunkCol, chunkRow, zLevel) {
    return `staticRoofMask:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function staticRoofDrawCacheKey(chunkCol, chunkRow, profileId, profileRevision, zLevel) {
    return `staticRoofDraw:${profileRevision}:${profileId}:${horizontalZCacheTag(zLevel)}:${chunkCol},${chunkRow}`;
}
export function groundChunkWorkerDedupeKey(payload, profileRevision) {
    const chunkCol = payload.tileChunkCol ?? payload.chunkCol;
    const chunkRow = payload.tileChunkRow ?? payload.chunkRow;
    return `${groundChunkCacheKey(chunkCol, chunkRow, payload.profileId, profileRevision, payload.zLevel ?? 0)}:${payload.seed ?? 0}`;
}
export function wallAtlasWorkerDedupeKey(payload, profileRevision) {
    const p1 = payload.p1;
    const p2 = payload.p2;
    return `wall:${profileRevision}:${payload.profileId}:${p1.x.toFixed(1)},${p1.y.toFixed(1)}-${p2.x.toFixed(1)},${p2.y.toFixed(1)}:${payload.width}x${payload.height}:${payload.wallHeight ?? 0}:${payload.seed ?? 0}`;
}
export class SurfaceBakeCacheKeys {
    constructor(surfaceSpace) {
        this.surfaceSpace = surfaceSpace;
    }
    wrappedChunk(chunkCol, chunkRow) {
        return { chunkCol: this.surfaceSpace.wrapChunkCol(chunkCol), chunkRow: this.surfaceSpace.wrapChunkRow(chunkRow) };
    }
    groundChunkKey(chunkCol, chunkRow, profileId, zLevel = 0) {
        const wrapped = this.wrappedChunk(chunkCol, chunkRow);
        return groundChunkCacheKey(wrapped.chunkCol, wrapped.chunkRow, profileId, getSurfaceProfileRevision(profileId), zLevel);
    }
    staticRoofMaskKey(chunkCol, chunkRow, zLevel) {
        return staticRoofMaskCacheKey(chunkCol, chunkRow, zLevel);
    }
    staticRoofDrawKey(chunkCol, chunkRow, profileId, zLevel) {
        return staticRoofDrawCacheKey(chunkCol, chunkRow, profileId, getSurfaceProfileRevision(profileId), zLevel);
    }
    wallAtlasKey(p1, p2, surfaceSeed, profileId, atlasHeight) {
        const atlas = this.surfaceSpace.wallAtlas(p1, p2);
        const rev = getSurfaceProfileRevision(profileId);
        const key = `wall:${rev}:${profileId}:${surfaceSeed}:${atlasHeight}:${atlas.keyX1},${atlas.keyY1}-${atlas.keyX2},${atlas.keyY2}`;
        return { key, wrappedP1: atlas.wrappedP1, wrappedP2: atlas.wrappedP2, rev };
    }
}
