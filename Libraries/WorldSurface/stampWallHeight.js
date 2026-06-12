export const STAMP_WALL_LEVEL_MIN = 1;
export const STAMP_WALL_LEVEL_INFINI = 10;
/** @param {number} level */
export function clampStampWallHeightLevel(level) {
    return Math.max(STAMP_WALL_LEVEL_MIN, Math.min(STAMP_WALL_LEVEL_INFINI, Math.round(level)));
}
/**
 * Stamp height level → segment wallHeight. Levels 1–9 are explicit; level 10 (infiniwall) is null
 * (default game height, no roof cap — existing compileWall behavior).
 * @param {number} level
 * @param {number} cellSize
 * @returns {number | null}
 */
export function resolveStampWallHeight(level, cellSize) {
    const clamped = clampStampWallHeightLevel(level);
    if (clamped >= STAMP_WALL_LEVEL_INFINI) return null;
    return clamped * cellSize;
}
/** @param {number} level */
export function formatStampWallHeightLevel(level) {
    return clampStampWallHeightLevel(level) >= STAMP_WALL_LEVEL_INFINI ? "Infiniwall" : String(clampStampWallHeightLevel(level));
}
