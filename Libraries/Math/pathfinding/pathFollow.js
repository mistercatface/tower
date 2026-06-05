import { projectOntoPath, projectOntoPathFrom } from "../../Spatial/geometry/PathGeometry.js";

const WAYPOINT_SLACK = 2;
const CORNER_DOT_THRESHOLD = 0.15;

function getForwardPathStartIndex(path, x, y, navState) {
    const proj = projectOntoPath(x, y, path);
    let minIdx = proj.segmentIdx + (proj.t > 0.85 ? 2 : 1);
    minIdx = Math.max(0, Math.min(minIdx, path.length - 1));

    if (navState) {
        navState.pathProgressIdx = Math.max(navState.pathProgressIdx ?? 0, minIdx);
        return navState.pathProgressIdx;
    }

    return minIdx;
}

export function trimPathAhead(x, y, path) {
    if (!path || path.length === 0) return path;
    if (path.length === 1) return [{ x, y }, path[0]];

    const proj = projectOntoPath(x, y, path);
    let startIdx = proj.segmentIdx + 1;
    if (proj.t > 0.95) {
        startIdx = proj.segmentIdx + 2;
    }

    const trimmed = [{ x, y }];
    for (let i = startIdx; i < path.length; i++) {
        trimmed.push(path[i]);
    }

    if (trimmed.length < 2) {
        trimmed.push(path[path.length - 1]);
    }

    return trimmed;
}

function isAxisAlignedSegment(from, to) {
    return Math.abs(to.x - from.x) < 1 || Math.abs(to.y - from.y) < 1;
}

/** L-turn between two axis-aligned corridor legs (wall corner). */
export function isWallCornerWaypoint(path, idx) {
    if (idx <= 0 || idx >= path.length - 1) return false;

    const from = path[idx - 1];
    const corner = path[idx];
    const to = path[idx + 1];

    if (!isAxisAlignedSegment(from, corner) || !isAxisAlignedSegment(corner, to)) {
        return false;
    }

    const inDx = corner.x - from.x;
    const inDy = corner.y - from.y;
    const outDx = to.x - corner.x;
    const outDy = to.y - corner.y;
    const inLen = Math.hypot(inDx, inDy);
    const outLen = Math.hypot(outDx, outDy);
    if (inLen < 1 || outLen < 1) return false;

    const dot = (inDx * outDx + inDy * outDy) / (inLen * outLen);
    return dot < CORNER_DOT_THRESHOLD;
}

function hasPassedWaypoint(x, y, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? x >= to.x - WAYPOINT_SLACK : x <= to.x + WAYPOINT_SLACK;
    }
    return dy >= 0 ? y >= to.y - WAYPOINT_SLACK : y <= to.y + WAYPOINT_SLACK;
}

function getActiveWaypointIndex(x, y, path, arrivalDist, startIdx) {
    for (let i = startIdx; i < path.length; i++) {
        if (i > 0 && isWallCornerWaypoint(path, i)) {
            if (!hasPassedWaypoint(x, y, path[i - 1], path[i])) {
                return i;
            }
            continue;
        }

        const wp = path[i];
        const toWpX = wp.x - x;
        const toWpY = wp.y - y;
        const dist = Math.hypot(toWpX, toWpY);
        if (dist <= arrivalDist) {
            continue;
        }

        if (i + 1 < path.length) {
            const next = path[i + 1];
            const pathDx = next.x - wp.x;
            const pathDy = next.y - wp.y;
            const pathLenSq = pathDx * pathDx + pathDy * pathDy;
            if (pathLenSq > 0) {
                const along = (toWpX * pathDx + toWpY * pathDy) / pathLenSq;
                if (along < -0.2) {
                    continue;
                }
            }
        }

        return i;
    }
    return path.length - 1;
}

function constrainToSegmentAxis(x, y, from, to) {
    const segDx = to.x - from.x;
    const segDy = to.y - from.y;
    if (Math.abs(segDx) < 1) {
        const dy = to.y - y;
        if (Math.abs(dy) < 0.01) return null;
        return { x: 0, y: Math.sign(dy) };
    }
    if (Math.abs(segDy) < 1) {
        const dx = to.x - x;
        if (Math.abs(dx) < 0.01) return null;
        return { x: Math.sign(dx), y: 0 };
    }
    return null;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {{ x: number, y: number }[]} path
 * @param {number} targetX
 * @param {number} targetY
 * @param {object} [settings]
 * @param {object | null} [navState]
 * @returns {{ desiredX: number, desiredY: number, offPath: boolean }}
 */
export function computePathSteering(x, y, radius, path, targetX, targetY, settings = {}, navState = null) {
    const waypointArrival = Math.max(
        settings.pathWaypointArrival ?? 10,
        (radius || 6) * 1.2,
    );
    const offPathDistance = settings.pathOffPathDistance ?? 80;
    const arrivalDistance = settings.arrivalDistance ?? 2;

    const startIdx = getForwardPathStartIndex(path, x, y, navState);
    const proj = projectOntoPathFrom(path, x, y, Math.max(0, startIdx - 1));
    const activeIdx = getActiveWaypointIndex(x, y, path, waypointArrival, startIdx);
    const steerTarget = path[activeIdx];

    if (navState) {
        navState.pathProgressIdx = Math.max(navState.pathProgressIdx ?? 0, activeIdx);
    }

    const distToSteerTarget = Math.hypot(x - steerTarget.x, y - steerTarget.y);
    if (distToSteerTarget <= arrivalDistance) {
        return { desiredX: 0, desiredY: 0, offPath: false };
    }

    const prev = activeIdx > 0 ? path[activeIdx - 1] : null;
    const atWallCorner = isWallCornerWaypoint(path, activeIdx);
    const axisDir = atWallCorner && prev ? constrainToSegmentAxis(x, y, prev, steerTarget) : null;
    let dirX;
    let dirY;

    if (axisDir) {
        dirX = axisDir.x;
        dirY = axisDir.y;
    } else {
        dirX = steerTarget.x - x;
        dirY = steerTarget.y - y;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen < 0.01) {
            return { desiredX: 0, desiredY: 0, offPath: proj.dist > offPathDistance };
        }
        dirX /= dirLen;
        dirY /= dirLen;
    }

    return {
        desiredX: dirX,
        desiredY: dirY,
        offPath: proj.dist > offPathDistance,
    };
}
