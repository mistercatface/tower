/**
 * Circle contact geometry — surface points for casts, previews, and impulse hooks.
 */
/** @param {number} cx @param {number} cy @param {number} radius @param {number} dirX @param {number} dirY — unit */
export function circleLeadingPoint(cx, cy, radius, dirX, dirY) {
    return { x: cx + dirX * radius, y: cy + dirY * radius };
}
/** Push-out wall normal (away from solid into free space). */
export function circleWallContactPoint(cx, cy, radius, normalX, normalY) {
    return { x: cx - normalX * radius, y: cy - normalY * radius };
}
/** Point on circle A that faces circle B at first center–center contact. */
export function circlePairContactPoint(centerAx, centerAy, radiusA, centerBx, centerBy) {
    const dx = centerBx - centerAx;
    const dy = centerBy - centerAy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-8) return { x: centerAx + radiusA, y: centerAy };
    return { x: centerAx + (dx / d) * radiusA, y: centerAy + (dy / d) * radiusA };
}

/** Unit direction the struck circle (B) travels — line of centers at contact (A → B). */
export function circlePairStruckUnitDirection(contactAx, contactAy, centerBx, centerBy) {
    const dx = centerBx - contactAx;
    const dy = centerBy - contactAy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-8) return { x: 1, y: 0 };
    return { x: dx / d, y: dy / d };
}
