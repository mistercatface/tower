/** @typedef {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/**
 * @typedef {object} WallContext
 * @property {WorldObstacleGrid | null} [obstacleGrid]
 */
/** @param {{ obstacleGrid?: WorldObstacleGrid | null } | null} state */
export function wallContextFromState(state) {
    if (!state) return null;
    return { obstacleGrid: state.obstacleGrid ?? null };
}
export {};
