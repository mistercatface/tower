/**
 * Runtime settings for ground/wall/roof world-surface rendering.
 * Created by game bootstrap and passed into library constructors — no global singleton here.
 *
 * @typedef {Object} WorldSurfaceSettings
 * @property {number} cellsPerChunk
 * @property {number} tileResolution
 * @property {number} tileWorldSize
 * @property {number} chunkWorldSize
 * @property {number} viewPaddingPx
 * @property {number} viewQueryPadPx
 * @property {number} maxCachedSurfaces
 * @property {number} wallVisualHeight — wall face + roof z (set per game in gameDefinition.worldSurface)
 * @property {number} wallTextureStories
 * @property {number} wallTextureBleedPx
 * @property {number} wallSubdivNearPx
 * @property {number} wallSubdivFarPx
 * @property {boolean} groundChunkAnimationsOn
 * @property {boolean} wallAnimationsOn
 * @property {number|null} [animationBakeMaxFrames] — cap flipbook length (subsamples authored timeline)
 * @property {number} [animationFrameBatchSize] — frames per incremental worker bake after frame 0
 * @property {number[]} roofZLevels — derived at bootstrap from wallVisualHeight (runtime only)
 * @property {number} cellSize
 * @property {number} cameraHeight
 * @property {string} floorShadow
 */

/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "tileResolution" | "tileWorldSize" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "wallVisualHeight" | "wallTextureStories" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "cameraHeight" | "floorShadow">} params
 * @returns {WorldSurfaceSettings}
 */
export function createWorldSurfaceSettings(params) {
    return {
        groundChunkAnimationsOn: false,
        wallAnimationsOn: false,
        ...params,
    };
}

/** @param {WorldSurfaceSettings} settings */
export function getWallVisualHeight(settings) {
    const height = settings.wallVisualHeight;
    if (height == null) {
        throw new Error("worldSurface.wallVisualHeight must be set on the active game definition");
    }
    return height;
}
