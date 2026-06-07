import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { dotXY, lengthXY, normalizeXY, speedSqXY } from "../../Math/Vec2.js";
import { massFromBody } from "../../Motion/bodyMass.js";
import { COINCIDENT_CIRCLE_EPS, separateAlongNormal, separateCoincidentCirclePair } from "./penetration.js";
/**
 * @typedef {object} CirclePairContactResult
 * @property {number} normalX
 * @property {number} normalY
 * @property {number} avx
 * @property {number} avy
 * @property {number} bvx
 * @property {number} bvy
 * @property {number} cutFactor — fraction of striker speed along contact normal (preview)
 * @property {number} struckSpeed — |B velocity| after impulse
 */
/**
 * Circle–circle separation + impulse (sim and aim preview share this path).
 *
 * @param {{ x: number, y: number, radius: number, vx?: number, vy?: number, mass?: number }} a — striker; mutated when `separate`
 * @param {{ x: number, y: number, radius: number, vx?: number, vy?: number, mass?: number }} b — struck; velocities always updated
 * @param {{ restitution?: number, separate?: boolean, touchSlop?: number }} [options]
 * @returns {CirclePairContactResult | null}
 */
export function applyCirclePairContact(a, b, { restitution = getCollisionSettings().restitution.circlePair, separate = true, touchSlop = 0 } = {}) {
    const { nx: normalX, ny: normalY, len: dist } = normalizeXY(b.x - a.x, b.y - a.y);
    const minDist = a.radius + b.radius;
    if (dist > minDist + touchSlop) return null;
    const overlap = Math.max(0, minDist - dist);
    const avx0 = a.vx ?? 0;
    const avy0 = a.vy ?? 0;
    const bvx0 = b.vx ?? 0;
    const bvy0 = b.vy ?? 0;
    const pickupMass = getCollisionSettings().mass.pickupFallback;
    const massA = massFromBody(a, pickupMass);
    const massB = massFromBody(b, pickupMass);
    if (dist <= COINCIDENT_CIRCLE_EPS) {
        if (separate) separateCoincidentCirclePair(a, b, overlap || minDist, massA, massB);
        return { normalX: 0, normalY: 0, avx: avx0, avy: avy0, bvx: bvx0, bvy: bvy0, cutFactor: 0, struckSpeed: 0 };
    }
    const sourceSpeed = lengthXY(avx0, avy0);
    const cutFactor = sourceSpeed > 1e-6 ? Math.max(0, dotXY(avx0, avy0, normalX, normalY) / sourceSpeed) : 0;
    const velAlongNormal = dotXY(bvx0 - avx0, bvy0 - avy0, normalX, normalY);
    const isResting = speedSqXY(avx0, avy0) <= getCollisionSettings().restingSpeedSq && speedSqXY(bvx0, bvy0) <= getCollisionSettings().restingSpeedSq;
    if (isResting && velAlongNormal >= 0) return null;
    if (separate && overlap > 0) separateAlongNormal(a, b, normalX, normalY, overlap, massA, massB);
    let avx = avx0;
    let avy = avy0;
    let bvx = bvx0;
    let bvy = bvy0;
    if (velAlongNormal < 0) {
        const impulseScalar = (-(1 + restitution) * velAlongNormal) / (1 / massA + 1 / massB);
        avx = avx0 - (impulseScalar / massA) * normalX;
        avy = avy0 - (impulseScalar / massA) * normalY;
        bvx = bvx0 + (impulseScalar / massB) * normalX;
        bvy = bvy0 + (impulseScalar / massB) * normalY;
    }
    if (a.vx !== undefined) {
        a.vx = avx;
        a.vy = avy;
    }
    if (b.vx !== undefined) {
        b.vx = bvx;
        b.vy = bvy;
    }
    return { normalX, normalY, avx, avy, bvx, bvy, cutFactor, struckSpeed: lengthXY(bvx, bvy) };
}
/**
 * Circle-circle overlap resolution + velocity impulse.
 * @returns {boolean} true if bodies were overlapping and handled
 */
export function resolveCirclePair(a, b, options = {}) {
    return applyCirclePairContact(a, b, options) != null;
}
