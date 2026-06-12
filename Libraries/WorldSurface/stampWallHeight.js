/**
 * Static grid wall height levels (1 … settings.maxWallHeightLevel).
 * @param {import("./WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 */
export function clampStampWallHeightLevel(level, settings) {
    return Math.max(1, Math.min(settings.maxWallHeightLevel, Math.round(level)));
}
