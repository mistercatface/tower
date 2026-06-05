import { SpatialQuery } from "./SpatialQuery.js";

/** @typedef {{ walls: object[], wallSpatialIndex?: object|null, obstacleGrid?: object|null }} WallContext */

const fallbackWallQuery = new SpatialQuery();

export function wallContextFromState(state) {
    if (!state) return null;
    return {
        walls: state.walls ?? [],
        wallSpatialIndex: state.wallSpatialIndex ?? null,
        obstacleGrid: state.obstacleGrid ?? null,
    };
}

export function getNearbyWalls(entity, wallCtx) {
    if (!wallCtx) return [];
    if (wallCtx.wallSpatialIndex) {
        return wallCtx.wallSpatialIndex.collectNearby(entity, fallbackWallQuery);
    }
    if (wallCtx.obstacleGrid) {
        return wallCtx.obstacleGrid.getNearbySegments(entity);
    }
    return wallCtx.walls;
}

export function getWallsAlongLine(x1, y1, x2, y2, wallCtx) {
    if (!wallCtx) return [];
    if (wallCtx.obstacleGrid) {
        return wallCtx.obstacleGrid.getSegmentsAlongLine(x1, y1, x2, y2);
    }
    return wallCtx.walls;
}
