import { SpatialQuery } from "./SpatialQuery.js";
import { collectWallSegmentsAlongLine, collectWallSegmentsForEntity } from "./wallSegmentQuery.js";
/** @typedef {import("../indexes/WallSpatialIndex.js").WallSpatialIndex} WallSpatialIndex */
/** @typedef {import("../grid/WorldObstacleGrid.js").WorldObstacleGrid} WorldObstacleGrid */
/**
 * @typedef {object} WallContext
 * @property {object[]} walls
 * @property {WallSpatialIndex | null} [wallSpatialIndex]
 * @property {WorldObstacleGrid | null} [obstacleGrid]
 */
const fallbackWallQuery = new SpatialQuery();
/** @param {{ walls?: object[], wallSpatialIndex?: WallSpatialIndex | null, obstacleGrid?: WorldObstacleGrid | null } | null} state */
export function wallContextFromState(state) {
    if (!state) return null;
    return { walls: state.walls ?? [], wallSpatialIndex: state.wallSpatialIndex ?? null, obstacleGrid: state.obstacleGrid ?? null };
}
export function getNearbyWalls(entity, wallCtx) {
    return collectWallSegmentsForEntity(fallbackWallQuery, wallCtx, entity);
}
export function getWallsAlongLine(x1, y1, x2, y2, wallCtx) {
    return collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2);
}
export {};
