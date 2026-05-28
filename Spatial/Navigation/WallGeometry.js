export function closestPointOnSegment(wall, x, y) {
    const dx = x - wall.x;
    const dy = y - wall.y;
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    let localX = dx * cos - dy * sin;
    let localY = dx * sin + dy * cos;
    const half = wall.size / 2;
    localX = Math.max(-half, Math.min(half, localX));
    localY = Math.max(-half, Math.min(half, localY));

    const worldCos = Math.cos(wall.angle);
    const worldSin = Math.sin(wall.angle);
    return {
        x: wall.x + localX * worldCos - localY * worldSin,
        y: wall.y + localX * worldSin + localY * worldCos,
    };
}

export function distanceToSegment(wall, x, y) {
    if (wall.isDead) return Infinity;

    const closest = closestPointOnSegment(wall, x, y);
    return Math.hypot(x - closest.x, y - closest.y);
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
