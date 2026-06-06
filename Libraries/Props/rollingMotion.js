/**
 * Couple linear push velocity to visual spin for rolling props (beach ball, barrel, etc.).
 * Works with applyVelocityDamping, which integrates angularVelocity into facing.
 */

/**
 * @param {number} vx
 * @param {number} vy
 * @param {number} radius
 */
export function computeRollingAngularVelocity(vx, vy, radius) {
    const speed = Math.hypot(vx, vy);
    if (speed < 1.5) return 0;

    const r = Math.max(1, radius);
    const heading = Math.atan2(vy, vx);
    // Top-down lofi roll: spin sign follows travel heading.
    const sign = Math.cos(heading) >= 0 ? -1 : 1;
    return sign * (speed / r);
}

/**
 * @param {{ vx?: number, vy?: number, angularVelocity?: number, radius?: number }} body
 * @param {{ radius?: number, blend?: number }} [options]
 */
export function applyRollingCoupling(body, { radius, blend = 0.4 } = {}) {
    const target = computeRollingAngularVelocity(
        body.vx ?? 0,
        body.vy ?? 0,
        radius ?? body.radius ?? 8,
    );
    if (target === 0) return;

    const current = body.angularVelocity ?? 0;
    body.angularVelocity = current + (target - current) * blend;
}
