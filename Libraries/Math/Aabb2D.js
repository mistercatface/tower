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
export function aabbContains(outer, inner) {
    return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
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
/** Centered box from half-extents; optional uniform padding (viewport-style). @param {Aabb2D} out @returns {Aabb2D} */
export function centerHalfExtentsAabbInto(out, cx, cy, halfW, halfH, padding = 0) {
    out.minX = cx - halfW - padding;
    out.minY = cy - halfH - padding;
    out.maxX = cx + halfW + padding;
    out.maxY = cy + halfH + padding;
    return out;
}
/** @returns {Aabb2D | null} */
export function intersectAabb(a, b) {
    const minX = Math.max(a.minX, b.minX);
    const minY = Math.max(a.minY, b.minY);
    const maxX = Math.min(a.maxX, b.maxX);
    const maxY = Math.min(a.maxY, b.maxY);
    if (minX >= maxX || minY >= maxY) return null;
    return { minX, minY, maxX, maxY };
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
