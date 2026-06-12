export const STAMP_WALL_LEVEL_MIN = 1;
export const STAMP_WALL_LEVEL_INFINI = 10;
/** @param {number} level */
export function clampStampWallHeightLevel(level) {
    return Math.max(STAMP_WALL_LEVEL_MIN, Math.min(STAMP_WALL_LEVEL_INFINI, Math.round(level)));
}
/** @param {number} level */
export function formatStampWallHeightLevel(level) {
    return clampStampWallHeightLevel(level) >= STAMP_WALL_LEVEL_INFINI ? "Infiniwall" : String(clampStampWallHeightLevel(level));
}
