/**
 * Instant velocity change from force or knockback direction (no collision response).
 */
/**
 * @typedef {object} ImpulseBody
 * @property {number} [vx]
 * @property {number} [vy]
 * @property {number} [mass]
 */
/**
 * @param {ImpulseBody} body — mutated in place; no-op if vx/vy missing
 * @param {number} fx
 * @param {number} fy
 * @param {{ mass?: number }} [options] — override mass; default body.mass ?? 1
 */
export function applyImpulse(body, fx, fy, { mass } = {}) {
    if (body.vx === undefined || body.vy === undefined) return;
    const m = mass ?? body.mass ?? 1.0;
    body.vx += fx / m;
    body.vy += fy / m;
}
/**
 * @param {ImpulseBody} body
 * @param {number} angle — radians
 * @param {number} magnitude — impulse strength (becomes force magnitude before mass divide)
 * @param {{ mass?: number }} [options]
 */
export function applyKnockback(body, angle, magnitude, options) {
    applyImpulse(body, Math.cos(angle) * magnitude, Math.sin(angle) * magnitude, options);
}
