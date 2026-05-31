import { projectOntoPath, projectOntoPathFrom } from "../Geometry/PathGeometry.js";

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

function remainingPathLength(path, segmentIdx, t) {
    if (path.length < 2) return 0;

    const ax = path[segmentIdx].x;
    const ay = path[segmentIdx].y;
    const bx = path[segmentIdx + 1].x;
    const by = path[segmentIdx + 1].y;
    let length = Math.hypot(bx - ax, by - ay) * (1 - t);

    for (let i = segmentIdx + 1; i < path.length - 1; i++) {
        length += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    }

    return length;
}

function samplePathAhead(path, segmentIdx, t, aheadDist) {
    if (path.length < 2) {
        return { x: path[0].x, y: path[0].y };
    }

    let remaining = aheadDist;
    let seg = segmentIdx;
    let segT = t;

    while (seg < path.length - 1) {
        const ax = path[seg].x;
        const ay = path[seg].y;
        const bx = path[seg + 1].x;
        const by = path[seg + 1].y;
        const segLen = Math.hypot(bx - ax, by - ay);

        if (segLen === 0) {
            seg++;
            segT = 0;
            continue;
        }

        const distLeftOnSeg = segLen * (1 - segT);
        if (remaining <= distLeftOnSeg) {
            const frac = segT + remaining / segLen;
            return {
                x: ax + (bx - ax) * frac,
                y: ay + (by - ay) * frac,
            };
        }

        remaining -= distLeftOnSeg;
        seg++;
        segT = 0;
    }

    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
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

function getActiveWaypointIndex(entity, path, arrivalDist, startIdx) {
    for (let i = startIdx; i < path.length; i++) {
        const wp = path[i];
        const toWpX = wp.x - entity.x;
        const toWpY = wp.y - entity.y;
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

export function computePathSteering(entity, path, targetX, targetY, settings = {}, navState = null) {
    const waypointArrival = Math.max(
        settings.pathWaypointArrival ?? 10,
        (entity.radius || 6) * 1.2
    );
    const offPathDistance = settings.pathOffPathDistance ?? 80;
    const arrivalDistance = settings.arrivalDistance ?? 2;

    const startIdx = getForwardPathStartIndex(path, entity.x, entity.y, navState);
    const proj = projectOntoPathFrom(path, entity.x, entity.y, Math.max(0, startIdx - 1));
    const activeIdx = getActiveWaypointIndex(entity, path, waypointArrival, startIdx);
    const steerTarget = activeIdx >= path.length - 1
        ? path[path.length - 1]
        : path[activeIdx];

    if (navState) {
        navState.pathProgressIdx = Math.max(navState.pathProgressIdx ?? 0, activeIdx);
    }

    const distToSteerTarget = Math.hypot(entity.x - steerTarget.x, entity.y - steerTarget.y);
    if (distToSteerTarget <= arrivalDistance) {
        return { desiredX: 0, desiredY: 0, offPath: false };
    }

    const dirX = steerTarget.x - entity.x;
    const dirY = steerTarget.y - entity.y;
    const dirLen = Math.hypot(dirX, dirY);

    if (dirLen < 0.01) {
        return { desiredX: 0, desiredY: 0, offPath: proj.dist > offPathDistance };
    }

    return {
        desiredX: dirX / dirLen,
        desiredY: dirY / dirLen,
        offPath: proj.dist > offPathDistance,
    };
}

export function steerTowardTarget(entity, targetX, targetY) {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) {
        entity.desiredX = 0;
        entity.desiredY = 0;
        return;
    }
    entity.desiredX = dx / len;
    entity.desiredY = dy / len;
}
