/**
 * Velocity and angular drag for coasting / knockback decay (top-down locomotion).
 */

/**
 * @typedef {object} DampedBody
 * @property {number} x
 * @property {number} y
 * @property {number} [vx]
 * @property {number} [vy]
 * @property {number} [facing]
 * @property {number} [angularVelocity]
 */

/**
 * @param {DampedBody} body — mutated in place
 * @param {number} dtMs
 * @param {{ friction?: number, integrateFacing?: boolean, snapSpeed?: number }} [options]
 */
export function applyVelocityDamping(body, dtMs, { friction = 8.0, integrateFacing = true, snapSpeed = 1 } = {}) {
    if (body.vx || body.vy) {
        body.x += (body.vx ?? 0) * (dtMs / 1000);
        body.y += (body.vy ?? 0) * (dtMs / 1000);
        const dragFactor = Math.exp(-friction * (dtMs / 1000));
        body.vx = (body.vx ?? 0) * dragFactor;
        body.vy = (body.vy ?? 0) * dragFactor;
        if (Math.hypot(body.vx, body.vy) < snapSpeed) {
            body.vx = 0;
            body.vy = 0;
        }
    }
    if (integrateFacing && body.angularVelocity) {
        body.facing = (body.facing ?? 0) + body.angularVelocity * (dtMs / 1000);
        const angularDrag = Math.exp(-friction * 0.8 * (dtMs / 1000));
        body.angularVelocity *= angularDrag;
        if (Math.abs(body.angularVelocity) < 0.1) {
            body.angularVelocity = 0;
        }
    }
}
