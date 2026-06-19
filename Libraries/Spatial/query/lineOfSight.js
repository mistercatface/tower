import { minDistanceSegmentToWall } from "../geometry/WallGeometry.js";
import { collectWallSegmentsAlongLine, resolveWallSegmentQueryRadius } from "./wallSegmentQuery.js";
export function hasLineOfSight(x1, y1, x2, y2, obstacleGrid, sourceRadius = 0, targetRadius = sourceRadius) {
    const corridorRadius = Math.max(sourceRadius, targetRadius);
    const segmentQueryRadius = resolveWallSegmentQueryRadius(obstacleGrid, corridorRadius);
    const candidateWalls = collectWallSegmentsAlongLine(obstacleGrid, x1, y1, x2, y2, segmentQueryRadius);
    for (let i = 0; i < candidateWalls.length; i++) {
        const seg = candidateWalls[i];
        if (minDistanceSegmentToWall(x1, y1, x2, y2, seg) <= corridorRadius) return false;
    }
    return true;
}
