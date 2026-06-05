import {
    collectSegmentsAlongLine,
    collectSegmentsNearPose,
    segmentGridLayoutFromObstacleGrid,
} from "../grid/segmentGridWalk.js";

/**
 * @typedef {import("../indexes/WallSpatialIndex.js").WallSpatialIndex} WallSpatialIndex
 * @typedef {{ walls: object[], wallSpatialIndex?: WallSpatialIndex | null, obstacleGrid?: object | null }} WallContext
 */

/**
 * @param {{ x: number, y: number, radius?: number, getBounds?: () => { minX: number, minY: number, maxX: number, maxY: number } }} entity
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
export function entityWorldAabb(entity) {
    if (entity.getBounds) {
        return entity.getBounds();
    }
    const r = entity.radius || 0;
    return {
        minX: entity.x - r,
        minY: entity.y - r,
        maxX: entity.x + r,
        maxY: entity.y + r,
    };
}

/**
 * Collect wall segments near an entity from spatial index, obstacle grid, or fallback list.
 * @param {import("./SpatialQuery.js").SpatialQuery} wallQuery
 * @param {WallContext | null} wallCtx
 * @param {object} entity
 * @returns {object[]}
 */
export function collectWallSegmentsForEntity(wallQuery, wallCtx, entity) {
    if (!wallCtx) return [];

    if (wallCtx.wallSpatialIndex) {
        return [...wallCtx.wallSpatialIndex.collectNearby(entity, wallQuery)];
    }

    if (wallCtx.obstacleGrid) {
        return wallCtx.obstacleGrid.getNearbySegments(entity);
    }

    return wallCtx.walls ?? [];
}

/**
 * @param {WallContext | null} wallCtx
 * @returns {object[]}
 */
export function collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2) {
    if (!wallCtx) return [];
    if (wallCtx.obstacleGrid?.segmentGrid) {
        return collectSegmentsAlongLine(
            segmentGridLayoutFromObstacleGrid(wallCtx.obstacleGrid),
            x1, y1, x2, y2,
        );
    }
    return wallCtx.walls ?? [];
}

/**
 * Direct obstacle-grid segment lookup (no spatial index / fallback walls).
 * @param {object} obstacleGrid — WorldObstacleGrid shape
 * @param {{ x: number, y: number, radius?: number }} pose
 */
export function collectObstacleGridSegmentsNearPose(obstacleGrid, pose) {
    return collectSegmentsNearPose(segmentGridLayoutFromObstacleGrid(obstacleGrid), pose);
}
