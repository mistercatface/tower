/**
 * Analytic ray vs stationary circle: earliest center distance equal to combined radii.
 *
 * @param {number} ox @param {number} oy
 * @param {number} dx @param {number} dy — unit direction
 * @param {number} cx @param {number} cy
 * @param {number} hitRadius — sum of both circle radii at contact
 * @returns {number | null}
 */
export function rayCircleHitDistance(ox, oy, dx, dy, cx, cy, hitRadius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - hitRadius * hitRadius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const inv2a = 1 / (2 * a);
    const t1 = (-b - sqrt) * inv2a;
    const t2 = (-b + sqrt) * inv2a;
    const epsilon = 1e-4;
    if (t1 >= epsilon) return t1;
    if (t2 >= epsilon) return t2;
    return null;
}
