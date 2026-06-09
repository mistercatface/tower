import { collectSegmentsAlongLine, segmentGridLayoutFromObstacleGrid } from "../grid/segmentGridWalk.js";
/** @typedef {import("./wallContext.js").WallContext} WallContext */
/**
 * Collect wall segments near an entity from spatial index, obstacle grid, or fallback list.
 * @param {import("./SpatialQuery.js").SpatialQuery} wallQuery
 * @param {WallContext | null} wallCtx
 * @param {object} entity
 * @returns {object[]}
 */
export function collectWallSegmentsForEntity(wallQuery, wallCtx, entity) {
    if (!wallCtx) return [];
    if (wallCtx.wallSpatialIndex) return [...wallCtx.wallSpatialIndex.collectNearby(entity, wallQuery)];
    if (wallCtx.obstacleGrid) return wallCtx.obstacleGrid.getNearbySegments(entity);
    return wallCtx.walls ?? [];
}
/**
 * @param {WallContext | null} wallCtx
 * @returns {object[]}
 */
export function collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2) {
    if (!wallCtx) return [];
    if (wallCtx.obstacleGrid?.segmentGrid) return collectSegmentsAlongLine(segmentGridLayoutFromObstacleGrid(wallCtx.obstacleGrid), x1, y1, x2, y2);
    return wallCtx.walls ?? [];
}
