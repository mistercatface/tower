/** @typedef {{ walls: object[], spatialHash?: object|null, obstacleGrid?: object|null }} WallContext */

export function wallContextFromState(state) {
    if (!state) return null;
    return {
        walls: state.walls ?? [],
        spatialHash: state.wallSpatialHash ?? null,
        obstacleGrid: state.obstacleGrid ?? null,
    };
}

export function getNearbyWalls(entity, wallCtx) {
    if (!wallCtx) return [];
    if (wallCtx.spatialHash) return wallCtx.spatialHash.getNearby(entity);
    if (wallCtx.obstacleGrid) return wallCtx.obstacleGrid.getNearbySegments(entity);
    return wallCtx.walls;
}

export function getWallsAlongLine(x1, y1, x2, y2, wallCtx) {
    if (!wallCtx) return [];
    if (wallCtx.obstacleGrid) {
        return wallCtx.obstacleGrid.getSegmentsAlongLine(x1, y1, x2, y2);
    }
    return wallCtx.walls;
}
