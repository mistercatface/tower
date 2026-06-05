import { advancePushableSleep, evaluatePushableSleepEligible, wakePushableBody } from "./pushableSleep.js";

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
 *   blocksSleep?: (pickup: object) => boolean,
 * }} hooks
 * @param {object[]} events — reusable buffer; collision results are appended
 * @returns {object[]}
 */
export function runPushablePhysicsPass(state, dt, spatialFrame, { updatePickups, runCollisions, blocksSleep = () => false }, events) {
    updatePickups(state, dt, spatialFrame);
    runCollisions(state, spatialFrame, events);
    tickPushableSleep(spatialFrame, { blocksSleep });
    return events;
}
