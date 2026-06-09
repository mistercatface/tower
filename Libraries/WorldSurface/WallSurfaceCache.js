import { getWallHeight } from "./WorldSurfaceSettings.js";
import { getSurfaceProfileRevision } from "./SurfaceProfileRevision.js";
/**
 * @typedef {Object} WallAtlasBakeContext
 * @property {number} surfaceSeed
 */
/**
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {WallAtlasBakeContext} proceduralSurfaceDraw
 * @param {string} profileId
 * @param {number} ppwu
 * @param {{ wallHeight?: number } | null} [cacheObj]
 * @param {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} [settings]
 */
export function buildWallAtlasCacheKey(p1, p2, proceduralSurfaceDraw, profileId, ppwu, cacheObj = null, settings) {
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
    const seed = proceduralSurfaceDraw.surfaceSeed;
    const rev = getSurfaceProfileRevision(profileId);
    const wallHeight = cacheObj?.wallHeight ?? getWallHeight(settings);
    const key = `wall:${rev}:${ppwu}:${profileId}:${seed}:${wallHeight}:${kx1},${ky1}-${kx2},${ky2}`;
    return { key, wrappedP1: { x: wx1, y: wy1 }, wrappedP2: { x: wx2, y: wy2 } };
}
/**
 * @param {{ x: number, y: number }} p1
 * @param {{ x: number, y: number }} p2
 * @param {WallAtlasBakeContext} proceduralSurfaceDraw
 * @param {string} profileId
 * @param {number} ppwu
 * @param {{ wallHeight?: number, _wkInfo?: object, _wkProfileId?: string, _wkPpwu?: number, _wkRev?: number, _wkSeed?: number, _wkWallHeight?: number } | null} cacheObj
 * @param {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} [settings]
 */
export function getWallAtlasCacheInfo(p1, p2, proceduralSurfaceDraw, profileId, ppwu, cacheObj, settings) {
    const seed = proceduralSurfaceDraw.surfaceSeed;
    const rev = getSurfaceProfileRevision(profileId);
    const wallHeightKey = cacheObj?.wallHeight ?? getWallHeight(settings);
    if (
        cacheObj &&
        cacheObj._wkInfo &&
        cacheObj._wkProfileId === profileId &&
        cacheObj._wkPpwu === ppwu &&
        cacheObj._wkRev === rev &&
        cacheObj._wkSeed === seed &&
        cacheObj._wkWallHeight === wallHeightKey
    )
        return cacheObj._wkInfo;
    const info = buildWallAtlasCacheKey(p1, p2, proceduralSurfaceDraw, profileId, ppwu, cacheObj, settings);
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
