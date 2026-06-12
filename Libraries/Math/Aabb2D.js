/** @typedef {{ minX: number; minY: number; maxX: number; maxY: number }} Aabb2D */
export function pointInAabb(px, py, { minX, minY, maxX, maxY }) {
    return px >= minX && px <= maxX && py >= minY && py <= maxY;
}
export function unionAabb(a, b) {
    return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
export function padAabb({ minX, minY, maxX, maxY }, pad) {
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}
export function centeredAabb(cx, cy, width, height) {
    const halfW = width / 2;
    const halfH = height / 2;
    return { minX: cx - halfW, minY: cy - halfH, maxX: cx + halfW, maxY: cy + halfH };
}
export function aabbContains(outer, inner) {
    return outer.minX <= inner.minX && outer.minY <= inner.minY && outer.maxX >= inner.maxX && outer.maxY >= inner.maxY;
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
    const hit = intersectAabb(a, b);
    if (!hit) return false;
    out.minX = hit.minX;
    out.minY = hit.minY;
    out.maxX = hit.maxX;
    out.maxY = hit.maxY;
    return true;
}
export function closestPointOnAabb(px, py, minX, minY, maxX, maxY) {
    return { x: Math.max(minX, Math.min(px, maxX)), y: Math.max(minY, Math.min(py, maxY)) };
}
export function distanceSqToAabb(px, py, minX, minY, maxX, maxY) {
    const closest = closestPointOnAabb(px, py, minX, minY, maxX, maxY);
    const dx = px - closest.x;
    const dy = py - closest.y;
    return dx * dx + dy * dy;
}
export function distanceToAabb(px, py, minX, minY, maxX, maxY) {
    return Math.sqrt(distanceSqToAabb(px, py, minX, minY, maxX, maxY));
}
export function circleIntersectsAabb(x, y, radius, { minX, minY, maxX, maxY }) {
    return distanceSqToAabb(x, y, minX, minY, maxX, maxY) <= radius * radius;
}
