/**
 * Preview-only estimates matching {@link resolveCirclePair} impulse math (B at rest).
 */
/**
 * Object velocity after circle A strikes circle B at rest.
 *
 * @param {number} sourceVx @param {number} sourceVy — A velocity before contact
 * @param {number} centerAx @param {number} centerAy — A center at contact
 * @param {number} centerBx @param {number} centerBy — B center
 * @param {{ restitution?: number, massA?: number, massB?: number }} [options]
 * @returns {{ vx: number, vy: number, normalX: number, normalY: number, cutFactor: number, speed: number }}
 */
export function estimateCirclePairStrikeFromRest(sourceVx, sourceVy, centerAx, centerAy, centerBx, centerBy, { restitution = 0.5, massA = 1, massB = 1 } = {}) {
    const dx = centerBx - centerAx;
    const dy = centerBy - centerAy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-8) return { vx: 0, vy: 0, normalX: 1, normalY: 0, cutFactor: 0, speed: 0 };
    const normalX = dx / dist;
    const normalY = dy / dist;
    const velAlongNormal = -sourceVx * normalX - sourceVy * normalY;
    const sourceSpeed = Math.hypot(sourceVx, sourceVy);
    const cutFactor = sourceSpeed > 1e-6 ? Math.max(0, (sourceVx * normalX + sourceVy * normalY) / sourceSpeed) : 0;
    if (velAlongNormal >= 0) return { vx: 0, vy: 0, normalX, normalY, cutFactor, speed: 0 };
    const invMassSum = 1 / massA + 1 / massB;
    const j = (-(1 + restitution) * velAlongNormal) / invMassSum;
    const vx = (j / massB) * normalX;
    const vy = (j / massB) * normalY;
    return { vx, vy, normalX, normalY, cutFactor, speed: Math.hypot(vx, vy) };
}
