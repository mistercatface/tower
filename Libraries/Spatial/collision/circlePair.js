import { massFromBody } from "../../Motion/bodyMass.js";
/**
 * Circle-circle overlap resolution + velocity impulse.
 * @returns {boolean} true if bodies were overlapping
 */
export function resolveCirclePair(a, b, { restitution = 0.5 } = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist >= minDist) return false;
    let normalX;
    let normalY;
    if (dist < 0.001) {
        const angle = Math.random() * Math.PI * 2;
        normalX = Math.cos(angle);
        normalY = Math.sin(angle);
    } else {
        normalX = dx / dist;
        normalY = dy / dist;
    }
    const overlap = minDist - dist;
    const massA = massFromBody(a, 1);
    const massB = massFromBody(b, 1);
    const totalMass = massA + massB;
    a.x -= normalX * overlap * (massB / totalMass);
    a.y -= normalY * overlap * (massB / totalMass);
    b.x += normalX * overlap * (massA / totalMass);
    b.y += normalY * overlap * (massA / totalMass);
    const avx = a.vx ?? 0;
    const avy = a.vy ?? 0;
    const bvx = b.vx ?? 0;
    const bvy = b.vy ?? 0;
    const rvx = bvx - avx;
    const rvy = bvy - avy;
    const velAlongNormal = rvx * normalX + rvy * normalY;
    if (velAlongNormal < 0) {
        const impulseScalar = (-(1 + restitution) * velAlongNormal) / (1 / massA + 1 / massB);
        if (a.vx !== undefined) {
            a.vx = avx - (impulseScalar / massA) * normalX;
            a.vy = avy - (impulseScalar / massA) * normalY;
        }
        if (b.vx !== undefined) {
            b.vx = bvx + (impulseScalar / massB) * normalX;
            b.vy = bvy + (impulseScalar / massB) * normalY;
        }
    }
    return true;
}
