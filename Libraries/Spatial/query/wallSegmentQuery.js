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
    let segments;
    if (wallCtx.wallSpatialIndex) segments = [...wallCtx.wallSpatialIndex.collectNearby(entity, wallQuery)];
    else if (wallCtx.obstacleGrid) segments = [...wallCtx.obstacleGrid.getNearbySegments(entity)];
    else segments = [...(wallCtx.walls ?? [])];
    if (wallCtx.obstacleGrid) wallCtx.obstacleGrid.appendStaticWallProxiesNear(entity, segments);
    return segments;
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
