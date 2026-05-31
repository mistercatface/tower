import { distanceToSegment, pushPointFromWalls } from "../Geometry/WallGeometry.js";

function getWallsNearPoint(obstacleGrid, x, y, clearance) {
    return obstacleGrid.getNearbySegments({
        x,
        y,
        radius: clearance + 48,
    });
}

function mergeWallLists(...lists) {
    const seen = new Set();
    const merged = [];
    for (const list of lists) {
        for (const wall of list) {
            if (!seen.has(wall)) {
                seen.add(wall);
                merged.push(wall);
            }
        }
    }
    return merged;
}

function getWallsNearSegment(obstacleGrid, ax, ay, bx, by, clearance) {
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    const halfLen = Math.hypot(bx - ax, by - ay) / 2;
    return mergeWallLists(
        obstacleGrid.getSegmentsAlongLine(ax, ay, bx, by),
        getWallsNearPoint(obstacleGrid, midX, midY, clearance + halfLen),
    );
}

function pushWaypointFromGeometry(obstacleGrid, x, y, clearance) {
    const walls = getWallsNearPoint(obstacleGrid, x, y, clearance);
    return pushPointFromWalls(x, y, walls, clearance);
}

function findWorstSegmentViolation(ax, ay, bx, by, walls, clearance) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.01) return null;

    const samples = Math.max(4, Math.ceil(segLen / Math.max(clearance, 8)));
    let worst = null;

    for (const wall of walls) {
        if (wall.isDead) continue;

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const px = ax + (bx - ax) * t;
            const py = ay + (by - ay) * t;
            const dist = distanceToSegment(wall, px, py);
            if (dist < clearance && (!worst || dist < worst.dist)) {
                worst = { x: px, y: py, t, dist };
            }
        }
    }

    return worst;
}

function relaxSegmentEndpoints(obstacleGrid, a, b, clearance) {
    const walls = getWallsNearSegment(obstacleGrid, a.x, a.y, b.x, b.y, clearance);
    const violation = findWorstSegmentViolation(a.x, a.y, b.x, b.y, walls, clearance);
    if (!violation) {
        return { a, b, changed: false };
    }

    const pushed = pushPointFromWalls(violation.x, violation.y, walls, clearance);
    const dx = pushed.x - violation.x;
    const dy = pushed.y - violation.y;
    const w0 = 1 - violation.t;
    const w1 = violation.t;

    return {
        a: pushWaypointFromGeometry(obstacleGrid, a.x + dx * w0, a.y + dy * w0, clearance),
        b: pushWaypointFromGeometry(obstacleGrid, b.x + dx * w1, b.y + dy * w1, clearance),
        changed: true,
    };
}

function relaxPathEndpoints(obstacleGrid, path, clearance, passes = 4) {
    const adjusted = path.map((wp) => pushWaypointFromGeometry(obstacleGrid, wp.x, wp.y, clearance));

    for (let pass = 0; pass < passes; pass++) {
        let anyChanged = false;
        for (let i = 0; i < adjusted.length - 1; i++) {
            const result = relaxSegmentEndpoints(
                obstacleGrid,
                adjusted[i],
                adjusted[i + 1],
                clearance,
            );
            adjusted[i] = result.a;
            adjusted[i + 1] = result.b;
            anyChanged = anyChanged || result.changed;
        }
        if (!anyChanged) break;
    }

    return adjusted;
}

function insertSegmentDetours(obstacleGrid, path, clearance) {
    const refined = [path[0]];

    for (let i = 1; i < path.length; i++) {
        const prev = refined[refined.length - 1];
        const next = path[i];
        const walls = getWallsNearSegment(obstacleGrid, prev.x, prev.y, next.x, next.y, clearance);
        const violation = findWorstSegmentViolation(prev.x, prev.y, next.x, next.y, walls, clearance);

        if (violation) {
            refined.push(pushPointFromWalls(violation.x, violation.y, walls, clearance));
        }
        refined.push(next);
    }

    return refined;
}

export function adjustPathForClearance(path, obstacleGrid, clearance, destination = null) {
    if (!path || path.length === 0 || !obstacleGrid) {
        return path;
    }

    let adjusted = relaxPathEndpoints(obstacleGrid, path, clearance);
    adjusted = insertSegmentDetours(obstacleGrid, adjusted, clearance);
    adjusted = relaxPathEndpoints(obstacleGrid, adjusted, clearance, 2);

    if (destination && adjusted.length > 0) {
        adjusted[adjusted.length - 1] = { x: destination.x, y: destination.y };
    }

    return adjusted;
}

export function resolveMoveTarget(obstacleGrid, x, y, clearance) {
    if (!obstacleGrid) {
        return { x, y };
    }
    return pushWaypointFromGeometry(obstacleGrid, x, y, clearance);
}
