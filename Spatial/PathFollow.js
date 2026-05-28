export const PATH_CLEARANCE_MARGIN = 10;

export function distanceToWall(wall, x, y, extraPadding = 0) {
    if (wall.isDead) return Infinity;

    const dx = x - wall.x;
    const dy = y - wall.y;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const half = wall.size / 2 + wall.padding + extraPadding;
    const distX = Math.max(0, Math.abs(localX) - half);
    const distY = Math.max(0, Math.abs(localY) - half);
    return Math.hypot(distX, distY);
}

export function closestPointOnWall(wall, x, y, extraPadding = 0) {
    const dx = x - wall.x;
    const dy = y - wall.y;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    let localX = dx * cos - dy * sin;
    let localY = dx * sin + dy * cos;
    const half = wall.size / 2 + wall.padding + extraPadding;
    localX = Math.max(-half, Math.min(half, localX));
    localY = Math.max(-half, Math.min(half, localY));

    const worldCos = Math.cos(wall.angle);
    const worldSin = Math.sin(wall.angle);
    return {
        x: wall.x + localX * worldCos - localY * worldSin,
        y: wall.y + localX * worldSin + localY * worldCos,
    };
}

export function projectOntoPath(x, y, path) {
    let bestDistSq = Infinity;
    let segmentIdx = 0;
    let t = 0;
    let closestX = path[0].x;
    let closestY = path[0].y;

    for (let i = 0; i < path.length - 1; i++) {
        const ax = path[i].x;
        const ay = path[i].y;
        const bx = path[i + 1].x;
        const by = path[i + 1].y;
        const segDx = bx - ax;
        const segDy = by - ay;
        const segLenSq = segDx * segDx + segDy * segDy;

        let segT = 0;
        if (segLenSq > 0) {
            segT = Math.max(0, Math.min(1, ((x - ax) * segDx + (y - ay) * segDy) / segLenSq));
        }

        const cx = ax + segDx * segT;
        const cy = ay + segDy * segT;
        const distSq = (x - cx) ** 2 + (y - cy) ** 2;

        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            segmentIdx = i;
            t = segT;
            closestX = cx;
            closestY = cy;
        }
    }

    return {
        segmentIdx,
        t,
        closestX,
        closestY,
        dist: Math.sqrt(bestDistSq),
    };
}

export function remainingPathLength(path, segmentIdx, t) {
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

export function samplePathAhead(path, segmentIdx, t, aheadDist) {
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
    if (path.length === 1) return [path[0]];

    const proj = projectOntoPath(x, y, path);
    const trimmed = [{ x: proj.closestX, y: proj.closestY }];
    let startIdx = proj.segmentIdx + 1;

    if (proj.t > 0.95) {
        startIdx = proj.segmentIdx + 2;
    }

    for (let i = startIdx; i < path.length; i++) {
        trimmed.push(path[i]);
    }

    if (trimmed.length < 2) {
        trimmed.push(path[path.length - 1]);
    }

    return trimmed;
}

export function blendWallRepulsion(x, y, dirX, dirY, obstacleGrid, clearance) {
    const walls = obstacleGrid.getNearbySegments({ x, y, radius: clearance + 48 });
    let repX = 0;
    let repY = 0;

    for (const wall of walls) {
        const dist = distanceToWall(wall, x, y);
        if (dist >= clearance) continue;

        const closest = closestPointOnWall(wall, x, y);
        let pushX = x - closest.x;
        let pushY = y - closest.y;
        let pushLen = Math.hypot(pushX, pushY);

        if (pushLen < 0.01) {
            pushX = x - wall.x;
            pushY = y - wall.y;
            pushLen = Math.hypot(pushX, pushY) || 1;
        }

        const strength = (clearance - dist) / clearance;
        repX += (pushX / pushLen) * strength;
        repY += (pushY / pushLen) * strength;
    }

    let finalX = dirX + repX;
    let finalY = dirY + repY;
    const len = Math.hypot(finalX, finalY);

    if (len <= 0) {
        return { x: dirX, y: dirY };
    }

    return { x: finalX / len, y: finalY / len };
}

export function computePathSteering(entity, path, targetX, targetY) {
    const proj = projectOntoPath(entity.x, entity.y, path);
    const remaining = remainingPathLength(path, proj.segmentIdx, proj.t);

    if (remaining < 24) {
        let dirX = targetX - entity.x;
        let dirY = targetY - entity.y;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen < 0.01) {
            return { desiredX: 0, desiredY: 0, offPath: false };
        }
        return { desiredX: dirX / dirLen, desiredY: dirY / dirLen, offPath: false };
    }

    const lookahead = Math.max(40, (entity.speed || 50) * 0.4);
    const ahead = samplePathAhead(path, proj.segmentIdx, proj.t, lookahead);

    let dirX = ahead.x - entity.x;
    let dirY = ahead.y - entity.y;
    const dirLen = Math.hypot(dirX, dirY);

    if (dirLen < 0.01) {
        dirX = targetX - entity.x;
        dirY = targetY - entity.y;
        const fallbackLen = Math.hypot(dirX, dirY);
        if (fallbackLen < 0.01) {
            return { desiredX: 0, desiredY: 0, offPath: false };
        }
        return { desiredX: dirX / fallbackLen, desiredY: dirY / fallbackLen, offPath: proj.dist > 80 };
    }

    return {
        desiredX: dirX / dirLen,
        desiredY: dirY / dirLen,
        offPath: proj.dist > 80,
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
