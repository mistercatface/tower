/**
 * Runtime settings for ground/wall/roof world-surface rendering.
 *
 * @typedef {Object} WorldSurfaceSettings
 * @property {number} cellsPerChunk
 * @property {number} chunkWorldSize
 * @property {number} viewPaddingPx
 * @property {number} viewQueryPadPx
 * @property {number} maxCachedSurfaces
 * @property {number} pixelsPerCell — floor bake px per grid-cell edge (tuning knob)
 * @property {number} wallHeight — wall + roof height in world units (tuning knob)
 * @property {number} texelResolution — derived: pixelsPerCell ÷ cellSize
 * @property {number} wallHeightCells — derived: wallHeight ÷ cellSize (draw LOD bands)
 * @property {number} wallTextureBleedPx
 * @property {number} wallSubdivNearPx
 * @property {number} wallSubdivFarPx
 * @property {boolean} groundChunkAnimationsOn
 * @property {boolean} wallAnimationsOn
 * @property {number|null} [animationBakeMaxFrames]
 * @property {number} [animationFrameBatchSize]
 * @property {number[]} roofZLevels — derived: [wallHeight]
 * @property {number} cellSize
 * @property {number} cameraHeight
 * @property {string} floorShadow
 */

/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "pixelsPerCell" | "texelResolution" | "wallHeight" | "wallHeightCells" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "cameraHeight" | "floorShadow" | "roofZLevels">} params
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
export function getWallHeight(settings) {
    if (settings.wallHeight == null) {
        throw new Error("worldSurface.wallHeight must be set on the active game definition");
    }
    return settings.wallHeight;
}
