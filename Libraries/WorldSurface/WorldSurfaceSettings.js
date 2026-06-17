/**
 * Runtime settings for ground/wall/roof world-surface rendering.
 *
 * @typedef {Object} WorldSurfaceSettings
 * @property {number} cellsPerChunk
 * @property {number} chunkWorldSize — wall UV wrap period in world px (from chunkWorldSpanCells at install)
 * @property {number} viewPaddingPx
 * @property {number} viewQueryPadPx
 * @property {number} maxCachedSurfaces
 * @property {number} surfaceBakeScale — bake pixels per world pixel (1 = one texel per world unit)
 * @property {number} maxWallHeightLevel — static grid stamp level cap (1 … N)
 * @property {number} wallHeightCells — default segment/rail cap height in grid cells
 * @property {number} wallTextureBleedPx
 * @property {number} wallSubdivNearPx
 * @property {number} wallSubdivFarPx
 * @property {number|null} [animationBakeMaxFrames] — animated surface flipbook cap
 * @property {number[]} roofZLevels — default roof Z in world px
 * @property {number} cellSize
 * @property {string} floorShadow
 */
/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "surfaceBakeScale" | "maxWallHeightLevel" | "wallHeightCells" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "floorShadow" | "roofZLevels">} params
 * @returns {WorldSurfaceSettings}
 */
export function createWorldSurfaceSettings(params) {
    return { ...params };
}
