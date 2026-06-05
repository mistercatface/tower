/** Closest point on segment (vx, vy)–(wx, wy) to point (px, py). */
export function closestPointOnLineSegment(px, py, vx, vy, wx, wy) {
    const dx = wx - vx;
    const dy = wy - vy;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return { x: vx, y: vy, t: 0 };
    let t = ((px - vx) * dx + (py - vy) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: vx + t * dx, y: vy + t * dy, t };
}

export function distanceSqToLineSegment(px, py, vx, vy, wx, wy) {
    const closest = closestPointOnLineSegment(px, py, vx, vy, wx, wy);
    const dx = px - closest.x;
    const dy = py - closest.y;
    return dx * dx + dy * dy;
}

export function distanceToLineSegment(px, py, vx, vy, wx, wy) {
    return Math.sqrt(distanceSqToLineSegment(px, py, vx, vy, wx, wy));
}
