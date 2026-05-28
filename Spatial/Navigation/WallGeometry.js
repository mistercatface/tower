export function toSegmentLocal(segment, x, y) {
    const dx = x - segment.x;
    const dy = y - segment.y;
    const cos = Math.cos(-segment.angle);
    const sin = Math.sin(-segment.angle);
    return {
        localX: dx * cos - dy * sin,
        localY: dx * sin + dy * cos,
        half: segment.size / 2,
    };
}

export function closestPointOnSegment(wall, x, y) {
    let { localX, localY, half } = toSegmentLocal(wall, x, y);
    localX = Math.max(-half, Math.min(half, localX));
    localY = Math.max(-half, Math.min(half, localY));

    const worldCos = Math.cos(wall.angle);
    const worldSin = Math.sin(wall.angle);
    return {
        x: wall.x + localX * worldCos - localY * worldSin,
        y: wall.y + localX * worldSin + localY * worldCos,
    };
}

export function distanceSqToSegment(segment, x, y) {
    if (segment.isDead) return Infinity;

    const { localX, localY, half } = toSegmentLocal(segment, x, y);
    const closestX = Math.max(-half, Math.min(localX, half));
    const closestY = Math.max(-half, Math.min(localY, half));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    return distDX * distDX + distDY * distDY;
}

export function distanceToSegment(wall, x, y) {
    const distSq = distanceSqToSegment(wall, x, y);
    return distSq === Infinity ? Infinity : Math.sqrt(distSq);
}

export function circleIntersectsSegment(circle, segment) {
    const radiusSq = circle.radius * circle.radius;
    return distanceSqToSegment(segment, circle.x, circle.y) < radiusSq;
}

export function pointToSegmentPaddingDistanceSq(segment, x, y) {
    if (segment.isDead) return Infinity;

    const { localX, localY, half } = toSegmentLocal(segment, x, y);
    const distX = Math.max(0, Math.abs(localX) - half);
    const distY = Math.max(0, Math.abs(localY) - half);
    return distX * distX + distY * distY;
}

export function getCircleSegmentPenetration(circle, segment) {
    if (segment.isDead) return null;

    const { localX, localY, half } = toSegmentLocal(segment, circle.x, circle.y);
    const closestX = Math.max(-half, Math.min(localX, half));
    const closestY = Math.max(-half, Math.min(localY, half));
    const distDX = localX - closestX;
    const distDY = localY - closestY;
    const distanceSq = distDX * distDX + distDY * distDY;
    const radiusSq = circle.radius * circle.radius;
    if (distanceSq >= radiusSq) return null;

    let normalX;
    let normalY;
    let overlap;
    if (distanceSq === 0) {
        const distToLeft = localX - -half;
        const distToRight = half - localX;
        const distToTop = localY - -half;
        const distToBottom = half - localY;
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        let localNormX = 0;
        let localNormY = 0;
        if (minDist === distToLeft) localNormX = -1;
        else if (minDist === distToRight) localNormX = 1;
        else if (minDist === distToTop) localNormY = -1;
        else localNormY = 1;
        const invCos = Math.cos(segment.angle);
        const invSin = Math.sin(segment.angle);
        normalX = localNormX * invCos - localNormY * invSin;
        normalY = localNormX * invSin + localNormY * invCos;
        overlap = circle.radius + minDist;
    } else {
        const distance = Math.sqrt(distanceSq);
        overlap = circle.radius - distance;
        const localNormX = distDX / distance;
        const localNormY = distDY / distance;
        const invCos = Math.cos(segment.angle);
        const invSin = Math.sin(segment.angle);
        normalX = localNormX * invCos - localNormY * invSin;
        normalY = localNormX * invSin + localNormY * invCos;
    }

    return { normalX, normalY, overlap, distanceSq };
}

export function pushPointFromWalls(x, y, walls, clearance) {
    let px = x;
    let py = y;

    for (let iter = 0; iter < 5; iter++) {
        for (const wall of walls) {
            if (wall.isDead) continue;

            const closest = closestPointOnSegment(wall, px, py);
            let pushX = px - closest.x;
            let pushY = py - closest.y;
            let dist = Math.hypot(pushX, pushY);

            if (dist < 0.01) {
                pushX = px - wall.x;
                pushY = py - wall.y;
                dist = Math.hypot(pushX, pushY);
                if (dist < 0.01) {
                    pushX = Math.cos(wall.angle + Math.PI / 2);
                    pushY = Math.sin(wall.angle + Math.PI / 2);
                    dist = 1;
                }
            }

            if (dist < clearance) {
                const scale = (clearance - dist) / dist;
                px += pushX * scale;
                py += pushY * scale;
            }
        }
    }

    return { x: px, y: py };
}
