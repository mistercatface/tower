/** @typedef {{ minX: number; minY: number; maxX: number; maxY: number }} Aabb2D */
/** @returns {Aabb2D} */
export function createAabb() {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
/** @param {Aabb2D} out @param {Aabb2D} src @returns {Aabb2D} */
export function copyAabbInto(out, src) {
    out.minX = src.minX;
    out.minY = src.minY;
    out.maxX = src.maxX;
    out.maxY = src.maxY;
    return out;
}
export function pointInAabb(px, py, { minX, minY, maxX, maxY }) {
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}
export function aabbOverlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
export function aabbIntersectsScalars(minX, minY, maxX, maxY, box) {
    return minX <= box.maxX && maxX >= box.minX && minY <= box.maxY && maxY >= box.minY;
}
export function aabbContains(outer, inner) {
    return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function minCornerAabbInto(out, minX, minY, width, height) {
    out.minX = minX;
    out.minY = minY;
    out.maxX = minX + width;
    out.maxY = minY + height;
    return out;
}
export function minCornerAabb(minX, minY, width, height) {
    return minCornerAabbInto(createAabb(), minX, minY, width, height);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function aabbFromTwoPointsInto(out, x1, y1, x2, y2) {
    out.minX = Math.min(x1, x2);
    out.minY = Math.min(y1, y2);
    out.maxX = Math.max(x1, x2);
    out.maxY = Math.max(y1, y2);
    return out;
}
/** @returns {Aabb2D} */
export function aabbFromTwoPoints(x1, y1, x2, y2) {
    return aabbFromTwoPointsInto(createAabb(), x1, y1, x2, y2);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function unionAabbInto(out, a, b) {
    out.minX = Math.min(a.minX, b.minX);
    out.minY = Math.min(a.minY, b.minY);
    out.maxX = Math.max(a.maxX, b.maxX);
    out.maxY = Math.max(a.maxY, b.maxY);
    return out;
}
export function unionAabb(a, b) {
    return unionAabbInto(createAabb(), a, b);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function padAabbInto(out, { minX, minY, maxX, maxY }, pad) {
    out.minX = minX - pad;
    out.minY = minY - pad;
    out.maxX = maxX + pad;
    out.maxY = maxY + pad;
    return out;
}
export function padAabb(a, pad) {
    return padAabbInto(createAabb(), a, pad);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function insetAabbInto(out, { minX, minY, maxX, maxY }, inset) {
    out.minX = minX + inset;
    out.minY = minY + inset;
    out.maxX = maxX - inset;
    out.maxY = maxY - inset;
    return out;
}
export function insetAabb(a, inset) {
    return insetAabbInto(createAabb(), a, inset);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centeredAabbInto(out, cx, cy, width, height) {
    const halfW = width / 2;
    const halfH = height / 2;
    out.minX = cx - halfW;
    out.minY = cy - halfH;
    out.maxX = cx + halfW;
    out.maxY = cy + halfH;
    return out;
}
export function centeredAabb(cx, cy, width, height) {
    return centeredAabbInto(createAabb(), cx, cy, width, height);
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centerHalfExtentsAabbInto(out, cx, cy, halfW, halfH, padding = 0) {
    out.minX = cx - halfW - padding;
    out.minY = cy - halfH - padding;
    out.maxX = cx + halfW + padding;
    out.maxY = cy + halfH + padding;
    return out;
}
/** @param {Aabb2D} out @returns {Aabb2D} */
export function centerReachAabbInto(out, cx, cy, reach) {
    out.minX = cx - reach;
    out.minY = cy - reach;
    out.maxX = cx + reach;
    out.maxY = cy + reach;
    return out;
}
export function centerReachAabb(cx, cy, reach) {
    return centerReachAabbInto(createAabb(), cx, cy, reach);
}
/** @param {{ x: number, y: number }} p0 @param {{ x: number, y: number }} p1 @param {{ x: number, y: number }} p2 @param {{ x: number, y: number }} p3 @param {Aabb2D | null | undefined} box */
export function pointsAabbOverlapAabb(p0, p1, p2, p3, box) {
    if (!box) return true;
    const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
    const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
    const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
    const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
    return aabbIntersectsScalars(minX, minY, maxX, maxY, box);
}
/** @param {Aabb2D} out @param {{ x: number, y: number }[]} points @param {number} [padding] @returns {Aabb2D} */
export function expandPointsAabbInto(out, points, padding = 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    out.minX = minX - padding;
    out.minY = minY - padding;
    out.maxX = maxX + padding;
    out.maxY = maxY + padding;
    return out;
}
/** @returns {Aabb2D | null} */
export function intersectAabb(a, b) {
    const out = createAabb();
    return intersectAabbInto(out, a, b) ? out : null;
}
/** @param {Aabb2D} out @returns {boolean} */
export function intersectAabbInto(out, a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (minX >= maxX || minY >= maxY) return false;
    out.minX = minX;
    out.minY = minY;
    out.maxX = maxX;
    out.maxY = maxY;
    return true;
}
/** @param {Aabb2D} out @param {Aabb2D | null | undefined} a @param {Aabb2D | null | undefined} b @returns {boolean} */
export function intersectAabbOptionalInto(out, a, b) {
    if (!a) {
        if (!b) return false;
        copyAabbInto(out, b);
        return true;
    }
    if (!b) {
        copyAabbInto(out, a);
        return true;
    }
    return intersectAabbInto(out, a, b);
}
export function closestPointOnAabb(px, py, minX, minY, maxX, maxY) {
    return { x: Math.max(minX, Math.min(px, maxX)), y: Math.max(minY, Math.min(py, maxY)) };
}
export function distanceSqToAabb(px, py, minX, minY, maxX, maxY) {
    const cx = Math.max(minX, Math.min(px, maxX));
    const cy = Math.max(minY, Math.min(py, maxY));
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
}
export function distanceToAabb(px, py, minX, minY, maxX, maxY) {
    return Math.sqrt(distanceSqToAabb(px, py, minX, minY, maxX, maxY));
}
export function circleIntersectsAabb(x, y, radius, { minX, minY, maxX, maxY }) {
    return distanceSqToAabb(x, y, minX, minY, maxX, maxY) <= radius * radius;
}
