import { distanceToSegment, pushPointFromWalls } from "../Geometry/WallGeometry.js";

function getWallsNearPoint(obstacleGrid, x, y, clearance) {
    return obstacleGrid.getNearbySegments({
        x,
        y,
        radius: clearance + 48,
    });
}

function isPointClear(x, y, walls, clearance) {
    for (const wall of walls) {
        if (distanceToSegment(wall, x, y) < clearance) {
            return false;
        }
    }
    return true;
}

function refineSegment(ax, ay, bx, by, obstacleGrid, clearance, maxDepth = 4) {
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    const walls = getWallsNearPoint(obstacleGrid, midX, midY, clearance);

    if (isPointClear(midX, midY, walls, clearance)) {
        return [{ x: midX, y: midY }];
    }

    if (maxDepth <= 0) {
        return [pushPointFromWalls(midX, midY, walls, clearance)];
    }

    const pushed = pushPointFromWalls(midX, midY, walls, clearance);
    const left = refineSegment(ax, ay, pushed.x, pushed.y, obstacleGrid, clearance, maxDepth - 1);
    const right = refineSegment(pushed.x, pushed.y, bx, by, obstacleGrid, clearance, maxDepth - 1);
    return [...left, pushed, ...right];
}

export function adjustPathForClearance(path, obstacleGrid, clearance, destination = null) {
    if (!path || path.length === 0 || !obstacleGrid) {
        return path;
    }

    const adjusted = [];
    for (let i = 0; i < path.length; i++) {
        const wp = path[i];
        const walls = getWallsNearPoint(obstacleGrid, wp.x, wp.y, clearance);
        adjusted.push(pushPointFromWalls(wp.x, wp.y, walls, clearance));
    }

    const refined = [adjusted[0]];
    for (let i = 1; i < adjusted.length; i++) {
        const prev = refined[refined.length - 1];
        const next = adjusted[i];
        const segmentWalls = obstacleGrid.getSegmentsAlongLine(prev.x, prev.y, next.x, next.y);
        const midX = (prev.x + next.x) / 2;
        const midY = (prev.y + next.y) / 2;
        const midWalls = segmentWalls.length > 0
            ? segmentWalls
            : getWallsNearPoint(obstacleGrid, midX, midY, clearance);

        if (!isPointClear(midX, midY, midWalls, clearance)) {
            refined.push(...refineSegment(prev.x, prev.y, next.x, next.y, obstacleGrid, clearance));
        }
        refined.push(next);
    }

    if (destination && refined.length > 0) {
        refined[refined.length - 1] = { x: destination.x, y: destination.y };
    }

    return refined;
}

export function resolveMoveTarget(obstacleGrid, x, y, clearance) {
    if (!obstacleGrid) {
        return { x, y };
    }
    const walls = getWallsNearPoint(obstacleGrid, x, y, clearance);
    return pushPointFromWalls(x, y, walls, clearance);
}
