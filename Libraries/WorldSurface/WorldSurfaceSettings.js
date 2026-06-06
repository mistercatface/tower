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
 * @property {number|null} wallVisualHeight
 * @property {number} wallHeightInset
 * @property {number} wallTextureStories
 * @property {number} wallTextureBleedPx
 * @property {number} wallSubdivNearPx
 * @property {number} wallSubdivFarPx
 * @property {boolean} groundChunkAnimationsOn
 * @property {boolean} wallAnimationsOn
 * @property {number|null} [animationBakeMaxFrames] — cap flipbook length (subsamples authored timeline)
 * @property {number} [animationFrameBatchSize] — frames per incremental worker bake after frame 0
 * @property {number} cellSize
 * @property {number} cameraHeight
 * @property {string} floorShadow
 */

/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "tileResolution" | "tileWorldSize" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "wallHeightInset" | "wallTextureStories" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "cameraHeight" | "floorShadow">} params
 * @returns {WorldSurfaceSettings}
 */
export function createWorldSurfaceSettings(params) {
    return {
        wallVisualHeight: null,
        groundChunkAnimationsOn: false,
        wallAnimationsOn: false,
        ...params,
    };
}

/**
 * @param {number} cameraHeight
 * @param {Pick<WorldSurfaceSettings, "wallVisualHeight" | "wallHeightInset">} settings
 */
export function resolveWallVisualHeight(cameraHeight, settings) {
    return settings.wallVisualHeight ?? (cameraHeight - settings.wallHeightInset);
}

/** @param {WorldSurfaceSettings} settings */
export function getWallVisualHeight(settings) {
    return resolveWallVisualHeight(settings.cameraHeight, settings);
}
