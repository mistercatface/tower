import { lengthXY } from "../../Math/Vec2.js";
import { circleIntersectsSegment } from "../geometry/WallGeometry.js";
/** @param {{ x: number, y: number, radius: number }} a @param {typeof a} b */
export function circlesOverlap(a, b) {
    return lengthXY(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}
/**
 * First wall segment intersecting a circle (broadphase + precise test).
 * @param {{ x: number, y: number, radius: number }} circle
 * @param {object[]} segments
 * @returns {object | null}
 */
export function findFirstCircleSegmentHit(circle, segments) {
    if (!segments || segments.length === 0) return null;
    const radius = circle.radius;
    for (const seg of segments) {
        if (seg.isDead) continue;
        const dx = circle.x - seg.x;
        const dy = circle.y - seg.y;
        const maxDist = radius + seg.size * 0.75;
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        if (circleIntersectsSegment(circle, seg)) return seg;
    }
    return null;
}
