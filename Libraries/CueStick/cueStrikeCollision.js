import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { applyRigidBodyImpulse } from "../Motion/rigidBodyImpulse.js";
import { massFromBody } from "../Motion/bodyMass.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
/** Cue tip effective mass vs cue ball — near equal mass gives realistic transfer (~cue speed, not 2×). */
export const CUE_STRIKER_MASS_RATIO = 1.0;
export const CUE_BALL_RESTITUTION = 0.93;
/**
 * Strike the cue ball through rigid-body impulse (kinematic cue tip), not scripted velocity.
 *
 * @param {object} cueBall
 * @param {{ nx: number, ny: number, power: number }} strike
 */
export function applyCueStrikeCollision(cueBall, strike) {
    const nx = strike.nx;
    const ny = strike.ny;
    const speed = strike.power;
    const ballMass = massFromBody(cueBall, getCollisionSettings().mass.pickupFallback);
    const radius = resolveBodyRadius(cueBall);
    const striker = { x: cueBall.x - nx * (radius + 0.5), y: cueBall.y - ny * (radius + 0.5), vx: nx * speed, vy: ny * speed, mass: ballMass * CUE_STRIKER_MASS_RATIO };
    applyRigidBodyImpulse(striker, cueBall, { nx, ny, overlap: 0.1, cx: cueBall.x - nx * radius, cy: cueBall.y - ny * radius }, CUE_BALL_RESTITUTION);
    wakePushableBody(cueBall);
}
