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
 * Pickup update → collision → wall resolve → sleep tick.
 *
 * @param {object} state
 * @param {number} dt
 * @param {object} spatialFrame
 * @param {{
 *   updatePickups: (state: object, dt: number, spatialFrame: object) => void,
 *   runCollisions: (state: object, spatialFrame: object) => object[],
 *   resolveWalls: (pickup: object, spatialFrame: object) => void,
 *   blocksSleep?: (pickup: object) => boolean,
 * }} hooks
 * @returns {object[]}
 */
export function runPushablePhysicsPass(state, dt, spatialFrame, { updatePickups, runCollisions, resolveWalls, blocksSleep = () => false }) {
    updatePickups(state, dt, spatialFrame);
    const events = runCollisions(state, spatialFrame);
    for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        if (pickup.isDead || !pickup.strategy?.isPushable) continue;
        if (pickup.isSleeping || !pickup.needsWallCollision()) continue;
        resolveWalls(pickup, spatialFrame);
    }
    tickPushableSleep(spatialFrame, { blocksSleep });
    return events;
}
