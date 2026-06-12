import { closestPointOnSegment, distanceToSegment, findClosestPointOnPathToWall, minDistanceSegmentToWall, pushPointFromWalls } from "../Spatial/geometry/WallGeometry.js";
import { corridorAabbInto, createAabb } from "../Math/Aabb2D.js";
const CLEARANCE_EPS = 0.01;
const WALL_QUERY_PAD = 48;
const SEGMENT_QUERY_BOUNDS = createAabb();
function getWallsNearPoint(navGraph, x, y, clearance) {
    return navGraph.getNearbySegments({ x, y, radius: clearance + WALL_QUERY_PAD });
}
function getWallsNearSegment(navGraph, ax, ay, bx, by, clearance) {
    return navGraph.getSegmentsInBounds(corridorAabbInto(SEGMENT_QUERY_BOUNDS, ax, ay, bx, by, clearance + WALL_QUERY_PAD));
}
function copyPoint(p) {
    return { x: p.x, y: p.y };
}
function pushWaypointFromGeometry(navGraph, x, y, clearance) {
    const walls = getWallsNearPoint(navGraph, x, y, clearance);
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
function fixSegmentByTranslation(navGraph, a, b, clearance) {
    let currentA = copyPoint(a);
    let currentB = copyPoint(b);
    let changed = false;
    for (let iter = 0; iter < 6; iter++) {
        const walls = getWallsNearSegment(navGraph, currentA.x, currentA.y, currentB.x, currentB.y, clearance);
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
        if (violation.t <= 0.5) currentA = pushWaypointFromGeometry(navGraph, currentA.x + dx, currentA.y + dy, clearance);
        else currentB = pushWaypointFromGeometry(navGraph, currentB.x + dx, currentB.y + dy, clearance);
        changed = true;
    }
    if (!changed) return { a, b, changed: false };
    return { a: pushWaypointFromGeometry(navGraph, currentA.x, currentA.y, clearance), b: pushWaypointFromGeometry(navGraph, currentB.x, currentB.y, clearance), changed: true };
}
function relaxPathClearance(navGraph, path, clearance, maxPasses = 4) {
    const adjusted = path.map(copyPoint);
    for (let pass = 0; pass < maxPasses; pass++) {
        let anyChanged = false;
        for (let i = 0; i < adjusted.length; i++) {
            const pushed = pushWaypointFromGeometry(navGraph, adjusted[i].x, adjusted[i].y, clearance);
            if (Math.hypot(pushed.x - adjusted[i].x, pushed.y - adjusted[i].y) > CLEARANCE_EPS) {
                adjusted[i] = pushed;
                anyChanged = true;
            }
        }
        for (let i = 0; i < adjusted.length - 1; i++) {
            const result = fixSegmentByTranslation(navGraph, adjusted[i], adjusted[i + 1], clearance);
            adjusted[i] = result.a;
            adjusted[i + 1] = result.b;
            anyChanged = anyChanged || result.changed;
        }
        if (!anyChanged) break;
    }
    return adjusted;
}
export function adjustPathForClearance(path, navGraph, clearance, destination = null) {
    if (!path || path.length === 0 || !navGraph) return path;
    const adjusted = path.map(copyPoint);
    if (destination && adjusted.length > 0) adjusted[adjusted.length - 1] = pushWaypointFromGeometry(navGraph, destination.x, destination.y, clearance);
    return relaxPathClearance(navGraph, adjusted, clearance);
}
const PATH_POINT_EPS = 1;
function pointsNear(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < PATH_POINT_EPS;
}
function isWorldSegmentClear(navGraph, ax, ay, bx, by, clearance) {
    const walls = navGraph.getSegmentsInBounds(corridorAabbInto(SEGMENT_QUERY_BOUNDS, ax, ay, bx, by, clearance + WALL_QUERY_PAD));
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (minDistanceSegmentToWall(ax, ay, bx, by, wall) < clearance - CLEARANCE_EPS) return false;
    }
    return true;
}
/** Split a world diagonal only when it would clip through a wall corner. */
export function orthogonalizePath(path, navGraph, clearance) {
    if (!path || path.length < 2 || !navGraph) return path;
    const out = [{ x: path[0].x, y: path[0].y }];
    for (let i = 1; i < path.length; i++) {
        const prev = out[out.length - 1];
        const curr = path[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const isDiagonal = Math.abs(dx) > PATH_POINT_EPS && Math.abs(dy) > PATH_POINT_EPS;
        if (isDiagonal && !isWorldSegmentClear(navGraph, prev.x, prev.y, curr.x, curr.y, clearance)) {
            const viaHorizontalFirst = { x: curr.x, y: prev.y };
            const viaVerticalFirst = { x: prev.x, y: curr.y };
            let via = viaVerticalFirst;
            if (i >= 2) {
                const legDx = path[i - 1].x - path[i - 2].x;
                const legDy = path[i - 1].y - path[i - 2].y;
                via = Math.abs(legDx) >= Math.abs(legDy) ? viaHorizontalFirst : viaVerticalFirst;
            } else {
                const horizClear =
                    isWorldSegmentClear(navGraph, prev.x, prev.y, viaHorizontalFirst.x, viaHorizontalFirst.y, clearance) &&
                    isWorldSegmentClear(navGraph, viaHorizontalFirst.x, viaHorizontalFirst.y, curr.x, curr.y, clearance);
                const vertClear =
                    isWorldSegmentClear(navGraph, prev.x, prev.y, viaVerticalFirst.x, viaVerticalFirst.y, clearance) &&
                    isWorldSegmentClear(navGraph, viaVerticalFirst.x, viaVerticalFirst.y, curr.x, curr.y, clearance);
                if (horizClear && !vertClear) via = viaHorizontalFirst;
                else if (vertClear) via = viaVerticalFirst;
            }
            if (!pointsNear(prev, via)) out.push({ x: via.x, y: via.y });
        }
        if (!pointsNear(out[out.length - 1], curr)) out.push({ x: curr.x, y: curr.y });
    }
    return out;
}
export function prepareNavigationPath(path, navGraph, clearance, destination = null) {
    if (!path || path.length === 0) return path;
    const adjusted = adjustPathForClearance(path, navGraph, clearance, destination);
    return orthogonalizePath(adjusted, navGraph, clearance);
}
export function resolveMoveTarget(navGraph, x, y, clearance) {
    if (!navGraph) return { x, y };
    return pushWaypointFromGeometry(navGraph, x, y, clearance);
}
/** Reposition: snap to the clicked walkable cell center — no geometry push/adjust. */
export function resolveRepositionTarget(navGraph, x, y, playerRadius) {
    if (!navGraph) return { x, y, col: null, row: null };
    const clickCell = navGraph.worldToGrid(x, y);
    if (clickCell.col < 0 || clickCell.col >= navGraph.cols || clickCell.row < 0 || clickCell.row >= navGraph.rows || navGraph.isBlocked(clickCell.col, clickCell.row)) return null;
    const center = navGraph.gridToWorld(clickCell.col, clickCell.row);
    if (!canPlaceMoveTarget(navGraph, center.x, center.y, playerRadius)) return null;
    return { x: center.x, y: center.y, col: clickCell.col, row: clickCell.row };
}
/** Whether a world point satisfies player clearance against wall segments (not grid cells). */
export function canPlaceMoveTarget(navGraph, x, y, clearance) {
    if (!navGraph) return true;
    const walls = getWallsNearPoint(navGraph, x, y, clearance);
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (minDistanceSegmentToWall(x, y, x, y, wall) < clearance - CLEARANCE_EPS) return false;
    }
    return true;
}
/** Snap a seed point to sit flush against the nearest wall segment (geometry, not grid). */
export function placeAtWallClearance(navGraph, x, y, clearance) {
    const walls = getWallsNearPoint(navGraph, x, y, clearance);
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
