/** @typedef {{ minX: number; minY: number; maxX: number; maxY: number }} Aabb2D */

export function closestPointOnAabb(px, py, minX, minY, maxX, maxY) {
    return {
        x: Math.max(minX, Math.min(px, maxX)),
        y: Math.max(minY, Math.min(py, maxY)),
    };
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
