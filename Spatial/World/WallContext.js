import { SpatialQuery } from "../../Libraries/Spatial/query/SpatialQuery.js";
import {
    collectWallSegmentsAlongLine,
    collectWallSegmentsForEntity,
} from "../../Libraries/Spatial/query/wallSegmentQuery.js";

/** @typedef {import("../../Libraries/Spatial/query/wallSegmentQuery.js").WallContext} WallContext */

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
    return collectWallSegmentsForEntity(fallbackWallQuery, wallCtx, entity);
}

export function getWallsAlongLine(x1, y1, x2, y2, wallCtx) {
    return collectWallSegmentsAlongLine(wallCtx, x1, y1, x2, y2);
}
