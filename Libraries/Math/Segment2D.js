/** True when segments (ax, ay)–(bx, by) and (cx, cy)–(dx, dy) intersect (inclusive endpoints). */
export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const cross = d1x * (cy - ay) - d1y * (cx - ax);
    const cross2 = d1x * (dy - ay) - d1y * (dx - ax);
    const cross3 = d2x * (ay - cy) - d2y * (ax - cx);
    const cross4 = d2x * (by - cy) - d2y * (bx - cx);
    if (((cross >= 0 && cross2 <= 0) || (cross <= 0 && cross2 >= 0)) && ((cross3 >= 0 && cross4 <= 0) || (cross3 <= 0 && cross4 >= 0))) return true;
    return false;
}
/** Intersection of two segments, or null when they do not cross at a single point. */
export function segmentIntersectionPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: ax + t * d1x, y: ay + t * d1y, t, u };
}
/** Minimum distance between segments (ax, ay)–(bx, by) and (cx, cy)–(dx, dy). */
export function distanceSegmentToSegment(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax;
    const uy = by - ay;
    const vx = dx - cx;
    const vy = dy - cy;
    const wx = ax - cx;
    const wy = ay - cy;
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sc;
    let sN;
    let sD = D;
    let tc;
    let tN;
    let tD = D;
    if (D < 1e-10) {
        sN = 0;
        sD = 1;
        tN = e;
        tD = c;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0) {
            sN = 0;
            tN = e;
            tD = c;
        } else if (sN > sD) {
            sN = sD;
            tN = e + b;
            tD = c;
        }
    }
    if (tN < 0) {
        tN = 0;
        if (-d < 0) sN = 0;
        else if (-d > a) sN = sD;
        else {
            sN = -d;
            sD = a;
        }
    } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0) sN = 0;
        else if (-d + b > a) sN = sD;
        else {
            sN = -d + b;
            sD = a;
        }
    }
    sc = Math.abs(sN) < 1e-10 ? 0 : sN / sD;
    tc = Math.abs(tN) < 1e-10 ? 0 : tN / tD;
    const px = ax + sc * ux;
    const py = ay + sc * uy;
    const qx = cx + tc * vx;
    const qy = cy + tc * vy;
    return Math.hypot(px - qx, py - qy);
}
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
