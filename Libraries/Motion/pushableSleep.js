import { getInteractionPairFilter } from "../../Core/GamePorts.js";
import { isStandTipActive } from "../Props/standTipMotion.js";
import { isMovingEntity, pairBroadphaseOverlap } from "../Spatial/collision/entityBroadphase.js";
/** Consecutive still frames required before a pushable is treated as sleeping. */
export const SLEEP_FRAMES = 30;
/** Max |angularVelocity| (rad/s) while counting toward sleep. */
export const SLEEP_ANGULAR_EPS = 0.1;
/** @param {object} entity */
export function isPushable(entity) {
    return Boolean(entity?.strategy?.isPushable);
}
/**
 * Motion eligibility for pushable sleep (stillness). Game state hooks via blocksSleep.
 *
 * @param {object} entity
 * @param {{ blocksSleep?: (entity: object) => boolean }} [opts]
 */
export function canSleepPushable(entity, { blocksSleep = () => false } = {}) {
    if (!isPushable(entity) || entity.isDead) return false;
    if (blocksSleep(entity)) return false;
    if (isMovingEntity(entity)) return false;
    if (isStandTipActive(entity)) return false;
    const w = entity.angularVelocity || 0;
    return Math.abs(w) <= SLEEP_ANGULAR_EPS;
}
/** Reset sleep counters on a pushable body. */
export function wakePushableBody(entity) {
    if (!isPushable(entity)) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
}
/**
 * Advance per-frame sleep counter on a pushable body.
 *
 * @param {object} entity
 * @param {boolean} eligible
 * @param {number} [requiredFrames]
 */
export function advancePushableSleep(entity, eligible, requiredFrames = SLEEP_FRAMES) {
    if (!isPushable(entity)) return;
    if (!eligible) {
        entity._sleepFrames = 0;
        entity.isSleeping = false;
        return;
    }
    entity._sleepFrames++;
    if (entity._sleepFrames >= requiredFrames) entity.isSleeping = true;
}
/**
 * @param {object} pickup
 * @param {object[]} neighbors
 * @param {{ filter?: PairFilter, pairOverlaps?: (a: object, b: object) => boolean }} [opts]
 */
export function hasSleepBlockingOverlap(pickup, neighbors, { filter = getInteractionPairFilter("pushableSleepBlocker"), pairOverlaps = pairBroadphaseOverlap } = {}) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === pickup) continue;
        if (!filter.allows(pickup, other)) continue;
        if (pairOverlaps(pickup, other)) return true;
    }
    return false;
}
/**
 * Full sleep eligibility: motion still + no blocking neighbor overlap.
 *
 * @param {object} pickup
 * @param {object[]} neighbors
 * @param {{ blocksSleep?: (entity: object) => boolean, filter?: PairFilter, pairOverlaps?: (a: object, b: object) => boolean }} [opts]
 */
export function evaluatePushableSleepEligible(pickup, neighbors, opts = {}) {
    const { blocksSleep = () => false, filter, pairOverlaps } = opts;
    return canSleepPushable(pickup, { blocksSleep }) && !hasSleepBlockingOverlap(pickup, neighbors, { filter, pairOverlaps });
}
