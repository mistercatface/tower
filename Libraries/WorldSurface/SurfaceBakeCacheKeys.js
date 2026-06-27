import { groundChunkCachePrefix, staticRoofDrawCachePrefix, staticRoofMaskCachePrefix } from "./bake/SurfaceBakeHelpers.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
export class SurfaceProfileRevisionBook {
    revision(profileId) {
        return getSurfaceProfileRevision(profileId);
    }
}
export class SurfaceBakeCacheKeys {
    constructor(settings, surfaceSpace, revisions = new SurfaceProfileRevisionBook()) {
        this.settings = settings;
        this.surfaceSpace = surfaceSpace;
        this.revisions = revisions;
    }
    profileRevision(profileId) {
        return this.revisions.revision(profileId);
    }
    groundChunk(chunkCol, chunkRow, profileId, zLevel = 0) {
        return groundChunkCachePrefix(chunkCol, chunkRow, profileId, this.profileRevision(profileId), zLevel);
    }
    staticRoofMask(chunkCol, chunkRow, zLevel) {
        return staticRoofMaskCachePrefix(chunkCol, chunkRow, zLevel);
    }
    staticRoofDraw(chunkCol, chunkRow, profileId, zLevel) {
        return staticRoofDrawCachePrefix(chunkCol, chunkRow, profileId, this.profileRevision(profileId), zLevel);
    }
    wallAtlas(p1, p2, surfaceSeed, profileId, atlasHeight) {
        const atlas = this.surfaceSpace.wallAtlas(p1, p2);
        const rev = this.profileRevision(profileId);
        const key = `wall:${rev}:${profileId}:${surfaceSeed}:${atlasHeight}:${atlas.keyX1},${atlas.keyY1}-${atlas.keyX2},${atlas.keyY2}`;
        return { key, wrappedP1: atlas.wrappedP1, wrappedP2: atlas.wrappedP2, rev };
    }
}
