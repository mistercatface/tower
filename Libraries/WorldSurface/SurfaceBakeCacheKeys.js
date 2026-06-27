import { groundChunkCachePrefix, staticRoofDrawCachePrefix, staticRoofMaskCachePrefix } from "./bake/SurfaceBakeHelpers.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
export class SurfaceProfileRevisionBook {
    revision(profileId) {
        return getSurfaceProfileRevision(profileId);
    }
}
export class SurfaceBakeCacheKeys {
    constructor(settings, revisions = new SurfaceProfileRevisionBook()) {
        this.settings = settings;
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
        const chunkWorldSize = this.settings.chunkWorldSize;
        const wx1 = ((p1.x % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const wy1 = ((p1.y % chunkWorldSize) + chunkWorldSize) % chunkWorldSize;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const wx2 = wx1 + dx;
        const wy2 = wy1 + dy;
        const kx1 = wx1.toFixed(1);
        const ky1 = wy1.toFixed(1);
        const kx2 = wx2.toFixed(1);
        const ky2 = wy2.toFixed(1);
        const rev = this.profileRevision(profileId);
        const key = `wall:${rev}:${profileId}:${surfaceSeed}:${atlasHeight}:${kx1},${ky1}-${kx2},${ky2}`;
        return { key, wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 }, rev };
    }
}
