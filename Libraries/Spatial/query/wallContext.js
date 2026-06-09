/** @typedef {import("../indexes/WallSpatialIndex.js").WallSpatialIndex} WallSpatialIndex */
/** @typedef {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/**
 * @typedef {object} WallContext
 * @property {object[]} walls
 * @property {WallSpatialIndex | null} [wallSpatialIndex]
 * @property {WorldObstacleGrid | null} [obstacleGrid]
 */
/** @param {{ walls?: object[], wallSpatialIndex?: WallSpatialIndex | null, obstacleGrid?: WorldObstacleGrid | null } | null} state */
export function wallContextFromState(state) {
    if (!state) return null;
    return { walls: state.walls ?? [], wallSpatialIndex: state.wallSpatialIndex ?? null, obstacleGrid: state.obstacleGrid ?? null };
}
export {};
