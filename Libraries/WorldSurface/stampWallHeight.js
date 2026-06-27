export function clampStampWallHeightLevel(level, settings) {
    return Math.max(1, Math.min(settings.maxWallHeightLevel, Math.round(level)));
}
