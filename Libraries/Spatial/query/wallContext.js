/** @typedef {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/**
 * @typedef {object} WallContext
 * @property {WorldObstacleGrid | null} [obstacleGrid]
 */
export function wallContextFromObstacleGrid(obstacleGrid) {
    return obstacleGrid ? { obstacleGrid } : null;
}
/** @param {{ obstacleGrid?: WorldObstacleGrid | null } | null} state */
export function wallContextFromState(state) {
    if (!state) return null;
    return wallContextFromObstacleGrid(state.obstacleGrid ?? null);
}
export {};
