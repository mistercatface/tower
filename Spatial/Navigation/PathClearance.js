import { closestPointOnSegment, distanceToSegment, findClosestPointOnPathToWall, minDistanceSegmentToWall, pushPointFromWalls } from "../Geometry/WallGeometry.js";

const CLEARANCE_EPS = 0.01;
const WALL_QUERY_PAD = 48;

function getWallsNearPoint(obstacleGrid, x, y, clearance) {
    return obstacleGrid.getNearbySegments({ x, y, radius: clearance + WALL_QUERY_PAD });
}

function getWallsNearSegment(obstacleGrid, ax, ay, bx, by, clearance) {
    const pad = clearance + WALL_QUERY_PAD;
    const minX = Math.min(ax, bx) - pad;
    const maxX = Math.max(ax, bx) + pad;
    const minY = Math.min(ay, by) - pad;
    const maxY = Math.max(ay, by) + pad;
    return obstacleGrid.getSegmentsInBounds(minX, minY, maxX, maxY);
}

function copyPoint(p) {
    return { x: p.x, y: p.y };
}

function pushWaypointFromGeometry(obstacleGrid, x, y, clearance) {
    const walls = getWallsNearPoint(obstacleGrid, x, y, clearance);
    return pushPointFromWalls(x, y, walls, clearance);
}

function findWorstSegmentViolation(ax, ay, bx, by, walls, clearance) {
    let worst = null;
    for (const wall of walls) {
        if (wall.isDead) continue;
        const segDist = minDistanceSegmentToWall(ax, ay, bx, by, wall);
        if (segDist >= clearance - CLEARANCE_EPS) continue;
        const closest = findClosestPointOnPathToWall(ax, ay, bx, by, wall);
        if (!worst || closest.dist < worst.dist) worst = closest;
    }

    return worst;
}

function segmentHasClearance(ax, ay, bx, by, walls, clearance) {
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (minDistanceSegmentToWall(ax, ay, bx, by, wall) < clearance - CLEARANCE_EPS) return false;
    }
    return true;
}

/** Shift a segment parallel so the worst clearance violation lands at exactly `clearance`. */
function fixSegmentByTranslation(obstacleGrid, a, b, clearance) {
    let currentA = copyPoint(a);
    let currentB = copyPoint(b);
    let changed = false;

    for (let iter = 0; iter < 6; iter++) {
        const walls = getWallsNearSegment(obstacleGrid, currentA.x, currentA.y, currentB.x, currentB.y, clearance);
        const violation = findWorstSegmentViolation(currentA.x, currentA.y, currentB.x, currentB.y, walls, clearance);
        if (!violation) break;
        const pushed = pushPointFromWalls(violation.x, violation.y, walls, clearance);
        const dx = pushed.x - violation.x;
        const dy = pushed.y - violation.y;
        if (Math.hypot(dx, dy) < CLEARANCE_EPS) break;
        const nextA = { x: currentA.x + dx, y: currentA.y + dy };
        const nextB = { x: currentB.x + dx, y: currentB.y + dy };
        if (segmentHasClearance(nextA.x, nextA.y, nextB.x, nextB.y, walls, clearance)) {
            currentA = nextA;
            currentB = nextB;
            changed = true;
            continue;
        }
        // Parallel shift wasn't enough (corner/angled approach) — push the nearer endpoint.
        if (violation.t <= 0.5) {
            currentA = pushWaypointFromGeometry(obstacleGrid, currentA.x + dx, currentA.y + dy, clearance);
        } else {
            currentB = pushWaypointFromGeometry(obstacleGrid, currentB.x + dx, currentB.y + dy, clearance);
        }
        changed = true;
    }

    if (!changed) {
        return { a, b, changed: false };
    }

    return { a: pushWaypointFromGeometry(obstacleGrid, currentA.x, currentA.y, clearance), b: pushWaypointFromGeometry(obstacleGrid, currentB.x, currentB.y, clearance), changed: true };
}

function relaxPathClearance(obstacleGrid, path, clearance, maxPasses = 4) {
    const adjusted = path.map(copyPoint);

    for (let pass = 0; pass < maxPasses; pass++) {
        let anyChanged = false;

        for (let i = 0; i < adjusted.length; i++) {
            const pushed = pushWaypointFromGeometry(obstacleGrid, adjusted[i].x, adjusted[i].y, clearance);
            if (Math.hypot(pushed.x - adjusted[i].x, pushed.y - adjusted[i].y) > CLEARANCE_EPS) {
                adjusted[i] = pushed;
                anyChanged = true;
            }
        }

        for (let i = 0; i < adjusted.length - 1; i++) {
            const result = fixSegmentByTranslation(obstacleGrid, adjusted[i], adjusted[i + 1], clearance);
            adjusted[i] = result.a;
            adjusted[i + 1] = result.b;
            anyChanged = anyChanged || result.changed;
        }

        if (!anyChanged) break;
    }

    return adjusted;
}

export function adjustPathForClearance(path, obstacleGrid, clearance, destination = null) {
    if (!path || path.length === 0 || !obstacleGrid) {
        return path;
    }

    const adjusted = path.map(copyPoint);

    if (destination && adjusted.length > 0) {
        adjusted[adjusted.length - 1] = pushWaypointFromGeometry(obstacleGrid, destination.x, destination.y, clearance);
    }

    return relaxPathClearance(obstacleGrid, adjusted, clearance);
}

const PATH_POINT_EPS = 1;

function pointsNear(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < PATH_POINT_EPS;
}

function isWorldSegmentClear(obstacleGrid, ax, ay, bx, by, clearance) {
    const pad = clearance + WALL_QUERY_PAD;
    const minX = Math.min(ax, bx) - pad;
    const maxX = Math.max(ax, bx) + pad;
    const minY = Math.min(ay, by) - pad;
    const maxY = Math.max(ay, by) + pad;
    const walls = obstacleGrid.getSegmentsInBounds(minX, minY, maxX, maxY);
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (minDistanceSegmentToWall(ax, ay, bx, by, wall) < clearance - CLEARANCE_EPS) {
            return false;
        }
    }
    return true;
}

/** Split a world diagonal only when it would clip through a wall corner. */
export function orthogonalizePath(path, obstacleGrid, clearance) {
    if (!path || path.length < 2 || !obstacleGrid) {
        return path;
    }

    const out = [{ x: path[0].x, y: path[0].y }];

    for (let i = 1; i < path.length; i++) {
        const prev = out[out.length - 1];
        const curr = path[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;

        const isDiagonal = Math.abs(dx) > PATH_POINT_EPS && Math.abs(dy) > PATH_POINT_EPS;
        if (isDiagonal && !isWorldSegmentClear(obstacleGrid, prev.x, prev.y, curr.x, curr.y, clearance)) {
            const viaHorizontalFirst = { x: curr.x, y: prev.y };
            const viaVerticalFirst = { x: prev.x, y: curr.y };

            let via = viaVerticalFirst;
            if (i >= 2) {
                const legDx = path[i - 1].x - path[i - 2].x;
                const legDy = path[i - 1].y - path[i - 2].y;
                via = Math.abs(legDx) >= Math.abs(legDy) ? viaHorizontalFirst : viaVerticalFirst;
            } else {
                const horizClear = isWorldSegmentClear(obstacleGrid, prev.x, prev.y, viaHorizontalFirst.x, viaHorizontalFirst.y, clearance)
                    && isWorldSegmentClear(obstacleGrid, viaHorizontalFirst.x, viaHorizontalFirst.y, curr.x, curr.y, clearance);
                const vertClear = isWorldSegmentClear(obstacleGrid, prev.x, prev.y, viaVerticalFirst.x, viaVerticalFirst.y, clearance)
                    && isWorldSegmentClear(obstacleGrid, viaVerticalFirst.x, viaVerticalFirst.y, curr.x, curr.y, clearance);
                if (horizClear && !vertClear) via = viaHorizontalFirst;
                else if (vertClear) via = viaVerticalFirst;
            }

            if (!pointsNear(prev, via)) {
                out.push({ x: via.x, y: via.y });
            }
        }

        if (!pointsNear(out[out.length - 1], curr)) {
            out.push({ x: curr.x, y: curr.y });
        }
    }

    return out;
}

export function prepareNavigationPath(path, obstacleGrid, clearance, destination = null) {
    if (!path || path.length === 0) {
        return path;
    }
    const adjusted = adjustPathForClearance(path, obstacleGrid, clearance, destination);
    return orthogonalizePath(adjusted, obstacleGrid, clearance);
}

export function resolveMoveTarget(obstacleGrid, x, y, clearance) {
    if (!obstacleGrid) {
        return { x, y };
    }
    return pushWaypointFromGeometry(obstacleGrid, x, y, clearance);
}

/** Reposition: snap to the clicked walkable cell center — no geometry push/adjust. */
export function resolveRepositionTarget(obstacleGrid, x, y, playerRadius) {
    if (!obstacleGrid) {
        return { x, y, col: null, row: null };
    }

    const clickCell = obstacleGrid.worldToGrid(x, y);
    if (
        clickCell.col < 0 || clickCell.col >= obstacleGrid.cols ||
        clickCell.row < 0 || clickCell.row >= obstacleGrid.rows ||
        obstacleGrid.isBlocked(clickCell.col, clickCell.row)
    ) {
        return null;
    }

    const center = obstacleGrid.gridToWorld(clickCell.col, clickCell.row);
    if (!canPlaceMoveTarget(obstacleGrid, center.x, center.y, playerRadius)) {
        return null;
    }

    return { x: center.x, y: center.y, col: clickCell.col, row: clickCell.row };
}

/** Whether a world point satisfies player clearance against wall segments (not grid cells). */
export function canPlaceMoveTarget(obstacleGrid, x, y, clearance) {
    if (!obstacleGrid) return true;

    const walls = getWallsNearPoint(obstacleGrid, x, y, clearance);
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (minDistanceSegmentToWall(x, y, x, y, wall) < clearance - CLEARANCE_EPS) {
            return false;
        }
    }
    return true;
}

/** Snap a seed point to sit flush against the nearest wall segment (geometry, not grid). */
export function placeAtWallClearance(obstacleGrid, x, y, clearance) {
    const walls = getWallsNearPoint(obstacleGrid, x, y, clearance);
    if (walls.length === 0) return { x, y, facing: 0 };
    let nearestWall = null;
    let nearestDist = Infinity;
    for (const wall of walls) {
        if (wall.isDead) continue;
        const dist = distanceToSegment(wall, x, y);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestWall = wall;
        }
    }
    if (!nearestWall) return { x, y, facing: 0 };
    const closest = closestPointOnSegment(nearestWall, x, y);
    let dx = x - closest.x;
    let dy = y - closest.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
        dx = Math.cos(nearestWall.angle + Math.PI / 2);
        dy = Math.sin(nearestWall.angle + Math.PI / 2);
        dist = 1;
    }
    const px = closest.x + (dx / dist) * clearance;
    const py = closest.y + (dy / dist) * clearance;
    const resolved = pushPointFromWalls(px, py, walls, clearance);
    return { x: resolved.x, y: resolved.y, facing: nearestWall.angle };
}
