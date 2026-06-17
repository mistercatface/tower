/**
 * Runtime settings for ground/wall/roof world-surface rendering.
 *
 * @typedef {Object} WorldSurfaceSettings
 * @property {number} cellsPerChunk
 * @property {number} chunkWorldSize
 * @property {number} viewPaddingPx
 * @property {number} viewQueryPadPx
 * @property {number} maxCachedSurfaces
 * @property {number} surfaceBakeScale — bake pixels per world pixel (1 = one texel per world unit)
 * @property {number} wallHeight — segment + flat-rail default height in world px
 * @property {number} maxWallHeightLevel — static grid stamp level cap (1 … N → N × cellSize px)
 * @property {number} wallHeightCells — derived: wallHeight ÷ cellSize (draw LOD bands)
 * @property {number} wallTextureBleedPx
 * @property {number} wallSubdivNearPx
 * @property {number} wallSubdivFarPx
 * @property {number|null} [animationBakeMaxFrames] — animated surface flipbook cap
 * @property {number[]} roofZLevels — derived: [wallHeight]
 * @property {number} cellSize
 * @property {number} cameraHeight
 * @property {string} floorShadow
 */
/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "surfaceBakeScale" | "wallHeight" | "maxWallHeightLevel" | "wallHeightCells" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "cameraHeight" | "floorShadow" | "roofZLevels">} params
 * @returns {WorldSurfaceSettings}
 */
export function createWorldSurfaceSettings(params) {
    return { ...params };
}
