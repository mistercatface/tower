import { advancePushableSleep, evaluatePushableSleepEligible, wakePushableBody } from "./pushableSleep.js";
import { integrateStandTipsAfterCollisions } from "../Props/standTipMotion.js";

/**
 * @param {object} state
 */
export function wakeAllPushables(state) {
    if (!state?.pickups) return;
    for (let i = 0; i < state.pickups.length; i++) {
        wakePushableBody(state.pickups[i]);
    }
}

/**
 * @param {object} spatialFrame
 * @param {{ blocksSleep?: (pickup: object) => boolean }} [options]
 */
export function tickPushableSleep(spatialFrame, { blocksSleep = () => false } = {}) {
    const pushables = spatialFrame._pushables;
    if (!pushables) return;
    for (let i = 0; i < pushables.length; i++) {
        const pickup = pushables[i];
        if (pickup.isDead) continue;
        const eligible = evaluatePushableSleepEligible(pickup, spatialFrame.getNeighbors(pickup), { blocksSleep });
        advancePushableSleep(pickup, eligible);
    }
}

/**
 * Pickup update → collision pass → sleep tick.
 * Pushable wall resolve runs inside the collision pipeline iterations.
 *
 * @param {object} state
 * @param {number} dt
 * @param {object} spatialFrame
 * @param {{
 *   updatePickups: (state: object, dt: number, spatialFrame: object) => void,
 *   runCollisions: (state: object, spatialFrame: object, events: object[]) => void,
 *   afterCollisions?: (state: object, dt: number) => void,
 *   blocksSleep?: (pickup: object) => boolean,
 * }} hooks
 * @param {object[]} events — reusable buffer; collision results are appended
 * @returns {object[]}
 */
export function runPushablePhysicsPass(state, dt, spatialFrame, { updatePickups, runCollisions, afterCollisions, blocksSleep = () => false }, events) {
    updatePickups(state, dt, spatialFrame);
    runCollisions(state, spatialFrame, events);
    integrateStandTipsAfterCollisions(state, dt);
    if (afterCollisions) afterCollisions(state, dt);
    tickPushableSleep(spatialFrame, { blocksSleep });
    return events;
}

/** In-plane spin about center: collision ω_z → facing (same frame, separate from 3D tumble). */
export function integrateLongAxisLogFacing(state, dt) {
    if (!state?.pickups) return;
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || pickup.isSleeping) continue;
        if (pickup.strategy?.rollAxis !== "long" && !pickup.strategy?.standTip) continue;
        const w = pickup.angularVelocity ?? 0;
        if (Math.abs(w) < 0.02) continue;
        pickup.facing = (pickup.facing ?? 0) + w * (dt / 1000);
    }
}
