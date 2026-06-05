/**
 * Runtime settings for floor/wall/roof world-surface rendering.
 * Installed once by game bootstrap; read via getWorldSurfaceSettings().
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
 * @property {boolean} floorAnimationsOn
 * @property {boolean} wallAnimationsOn
 * @property {number} cellSize
 * @property {number} cameraHeight
 * @property {string} floorShadow
 */

/** @type {WorldSurfaceSettings | null} */
let installedSettings = null;

/**
 * @param {Partial<WorldSurfaceSettings> & Pick<WorldSurfaceSettings, "cellsPerChunk" | "tileResolution" | "tileWorldSize" | "chunkWorldSize" | "viewPaddingPx" | "viewQueryPadPx" | "maxCachedSurfaces" | "wallHeightInset" | "wallTextureStories" | "wallTextureBleedPx" | "wallSubdivNearPx" | "wallSubdivFarPx" | "cellSize" | "cameraHeight" | "floorShadow">} params
 * @returns {WorldSurfaceSettings}
 */
export function createWorldSurfaceSettings(params) {
    return {
        wallVisualHeight: null,
        floorAnimationsOn: false,
        wallAnimationsOn: false,
        ...params,
    };
}

/** @param {WorldSurfaceSettings} settings */
export function installWorldSurfaceSettings(settings) {
    installedSettings = settings;
}

/** @returns {WorldSurfaceSettings} */
export function getWorldSurfaceSettings() {
    if (!installedSettings) {
        throw new Error("WorldSurfaceSettings not installed — import Render/WorldSurfaceBootstrap.js at startup");
    }
    return installedSettings;
}

/**
 * @param {number} cameraHeight
 * @param {Pick<WorldSurfaceSettings, "wallVisualHeight" | "wallHeightInset">} settings
 */
export function resolveWallVisualHeight(cameraHeight, settings) {
    return settings.wallVisualHeight ?? (cameraHeight - settings.wallHeightInset);
}

/** @param {WorldSurfaceSettings} [settings] */
export function getWallVisualHeight(settings = getWorldSurfaceSettings()) {
    return resolveWallVisualHeight(settings.cameraHeight, settings);
}
