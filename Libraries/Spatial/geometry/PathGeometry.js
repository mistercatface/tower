import { closestPointOnLineSegment } from "../../Math/Segment2D.js";
export function projectOntoPathFrom(path, x, y, startSegmentIdx = 0) {
    if (!path || path.length === 0) return { segmentIdx: 0, t: 0, closestX: x, closestY: y, dist: 0 };
    if (path.length === 1) {
        const dist = Math.hypot(x - path[0].x, y - path[0].y);
        return { segmentIdx: 0, t: 0, closestX: path[0].x, closestY: path[0].y, dist };
    }
    const firstSegment = Math.max(0, Math.min(startSegmentIdx, path.length - 2));
    let bestDistSq = Infinity;
    let segmentIdx = firstSegment;
    let t = 0;
    let closestX = path[firstSegment].x;
    let closestY = path[firstSegment].y;
    for (let i = firstSegment; i < path.length - 1; i++) {
        const ax = path[i].x;
        const ay = path[i].y;
        const bx = path[i + 1].x;
        const by = path[i + 1].y;
        const closest = closestPointOnLineSegment(x, y, ax, ay, bx, by);
        const distSq = (x - closest.x) ** 2 + (y - closest.y) ** 2;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            segmentIdx = i;
            t = closest.t;
            closestX = closest.x;
            closestY = closest.y;
        }
    }
    return { segmentIdx, t, closestX, closestY, dist: Math.sqrt(bestDistSq) };
}
export function projectOntoPath(x, y, path) {
    return projectOntoPathFrom(path, x, y, 0);
}
