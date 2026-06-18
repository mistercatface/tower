import { lengthXY } from "../Math/Vec2.js";
/**
 * Adaptive physics substep count from peak kinetic body displacement this tick.
 * Used by {@link runKineticPhysics}.
 *
 * @param {number} dtMs
 * @param {object[] | null | undefined} bodies
 * @param {{ maxStepPx?: number, maxSubsteps?: number }} [opts]
 * @returns {number}
 */
export function countMotionSubsteps(dtMs, bodies, { maxStepPx = 4, maxSubsteps = 8 } = {}) {
    if (!bodies?.length || dtMs <= 0 || maxStepPx <= 0) return 1;
    const dtSec = dtMs / 1000;
    let maxDisp = 0;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.isDead || body.isSleeping) continue;
        const disp = lengthXY(body.vx ?? 0, body.vy ?? 0) * dtSec;
        if (disp > maxDisp) maxDisp = disp;
    }
    if (maxDisp <= 1e-6) return 1;
    return Math.min(maxSubsteps, Math.max(1, Math.ceil(maxDisp / maxStepPx)));
}
