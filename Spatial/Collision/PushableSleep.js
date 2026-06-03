import { Actor } from "../../Entities/Actor.js";
import { isMovingEntity, pairBroadphaseOverlap } from "./PairBroadphase.js";

/** Consecutive still frames required before a pushable is treated as sleeping. */
export const SLEEP_FRAMES = 30;

/** Max |angularVelocity| (rad/s) while counting toward sleep. */
export const SLEEP_ANGULAR_EPS = 0.1;

export function canSleepPushable(pickup) {
    if (!pickup?.strategy?.isPushable || pickup.isDead) return false;
    if (pickup.currentState?.blocksSleep?.()) return false;
    if (isMovingEntity(pickup)) return false;
    const w = pickup.angularVelocity || 0;
    return Math.abs(w) <= SLEEP_ANGULAR_EPS;
}

/** Wake a pushable pickup after impulses, teleports, or collision resolution. */
export function wakePushable(pickup) {
    if (!pickup?.strategy?.isPushable) return;
    pickup._sleepFrames = 0;
    pickup.isSleeping = false;
}

export function wakeAllPushables(state) {
    if (!state?.pickups) return;
    for (let i = 0; i < state.pickups.length; i++) {
        wakePushable(state.pickups[i]);
    }
}

export function hasBlockingOverlap(pickup, spatialFrame) {
    const neighbors = spatialFrame.getNeighbors(pickup);
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === pickup || other.isDead) continue;
        if (other.strategy?.isPushable) {
            if (pairBroadphaseOverlap(pickup, other)) return true;
            continue;
        }
        if (other instanceof Actor && pairBroadphaseOverlap(pickup, other)) {
            return true;
        }
    }
    return false;
}

/** Call once per frame after pickup physics and collision (same spatialFrame). */
export function tickAllPushableSleep(state, spatialFrame) {
    const pushables = spatialFrame._pushables;
    for (let i = 0; i < pushables.length; i++) {
        const pickup = pushables[i];
        if (pickup.isDead) continue;
        const eligible = canSleepPushable(pickup) && !hasBlockingOverlap(pickup, spatialFrame);
        pickup.tickSleep(eligible);
    }
}
