import { getWorldSurfaceSettings, resolveWallVisualHeight } from "../../Libraries/WorldSurface/WorldSurfaceSettings.js";
import { getProfileRevision } from "./TileWorkerCoordinator.js";

/** @typedef {import("../adapters/WorldRenderAdapter.js").SurfaceBakeContext} SurfaceBakeContext */

export function buildWallAtlasCacheKey(p1, p2, surfaceBake, profileId, ppwu, cacheObj = null, settings = getWorldSurfaceSettings()) {
    const chunkWorldSize = settings.chunkWorldSize || 128 * settings.cellSize;
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
    const seed = surfaceBake.surfaceSeed;
    const rev = getProfileRevision(profileId);
    const wallHeight = cacheObj?.wallHeight ?? resolveWallVisualHeight(settings.cameraHeight, settings);
    const key = `wall:${rev}:${ppwu}:${profileId}:${seed}:${wallHeight}:${kx1},${ky1}-${kx2},${ky2}`;

    return { key, wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 } };
}

/** Drop per-edge wall atlas key memo after profile revision / surface cache clear. */
export function invalidateWallAtlasKeyMemos(state) {
    if (!state?.walls) return;
    for (const seg of state.walls) {
        const edges = seg._cachedEdges;
        if (!edges) continue;
        for (const edge of edges) {
            delete edge._wkInfo;
            delete edge._wkProfileId;
            delete edge._wkPpwu;
            delete edge._wkRev;
            delete edge._wkSeed;
            delete edge._wkWallHeight;
        }
    }
}

export function getWallAtlasCacheInfo(p1, p2, surfaceBake, profileId, ppwu, cacheObj, settings = getWorldSurfaceSettings()) {
    const seed = surfaceBake.surfaceSeed;
    const rev = getProfileRevision(profileId);
    const wallHeightKey = cacheObj?.wallHeight ?? resolveWallVisualHeight(settings.cameraHeight, settings);
    if (
        cacheObj
        && cacheObj._wkInfo
        && cacheObj._wkProfileId === profileId
        && cacheObj._wkPpwu === ppwu
        && cacheObj._wkRev === rev
        && cacheObj._wkSeed === seed
        && cacheObj._wkWallHeight === wallHeightKey
    ) {
        return cacheObj._wkInfo;
    }
    const info = buildWallAtlasCacheKey(p1, p2, surfaceBake, profileId, ppwu, cacheObj, settings);
    if (cacheObj) {
        cacheObj._wkInfo = info;
        cacheObj._wkProfileId = profileId;
        cacheObj._wkPpwu = ppwu;
        cacheObj._wkRev = rev;
        cacheObj._wkSeed = seed;
        cacheObj._wkWallHeight = wallHeightKey;
    }
    return info;
}
