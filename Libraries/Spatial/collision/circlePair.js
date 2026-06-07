import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { COINCIDENT_CIRCLE_EPS, separateAlongNormal, separateCoincidentCirclePair } from "./penetration.js";
/**
 * Circle-circle overlap resolution + velocity impulse.
 * @returns {boolean} true if bodies were overlapping and handled
 */
export function resolveCirclePair(a, b, { restitution = getCollisionSettings().restitution.circlePair } = {}) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist >= minDist) return false;
    const overlap = minDist - dist;
    const avx = a.vx ?? 0;
    const avy = a.vy ?? 0;
    const bvx = b.vx ?? 0;
    const bvy = b.vy ?? 0;
    const pickupMass = getCollisionSettings().mass.pickupFallback;
    const massA = massFromBody(a, pickupMass);
    const massB = massFromBody(b, pickupMass);
    if (dist <= COINCIDENT_CIRCLE_EPS) {
        separateCoincidentCirclePair(a, b, overlap, massA, massB);
        return true;
    }
    const normalX = dx / dist;
    const normalY = dy / dist;
    const rvx = bvx - avx;
    const rvy = bvy - avy;
    const velAlongNormal = rvx * normalX + rvy * normalY;
    const speedSqA = avx * avx + avy * avy;
    const speedSqB = bvx * bvx + bvy * bvy;
    const isResting = speedSqA <= getCollisionSettings().restingSpeedSq && speedSqB <= getCollisionSettings().restingSpeedSq;
    if (isResting && velAlongNormal >= 0) return false;
    separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB);
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
