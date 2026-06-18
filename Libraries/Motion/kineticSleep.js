import { getInteractionPairFilter } from "../../Core/interactionPairFilters.js";
import { isStandTipActive } from "../Props/standTipMotion.js";
import { isMovingEntity, pairBroadphaseOverlap } from "../Spatial/collision/entityBroadphase.js";
/** Consecutive still frames required before a kinetic body is treated as sleeping. */
export const SLEEP_FRAMES = 30;
/** Max |angularVelocity| (rad/s) while counting toward sleep. */
export const SLEEP_ANGULAR_EPS = 0.1;
/** @param {object} entity */
export function isKinetic(entity) {
    return Boolean(entity?.strategy?.isKinetic);
}
/**
 * Motion eligibility for kinetic sleep (stillness). Game state hooks via blocksSleep.
 *
 * @param {object} entity
 * @param {{ blocksSleep?: (entity: object) => boolean }} [opts]
 */
export function canSleepKinetic(entity, { blocksSleep = () => false } = {}) {
    if (!isKinetic(entity) || entity.isDead) return false;
    if (blocksSleep(entity)) return false;
    if (isMovingEntity(entity)) return false;
    if (isStandTipActive(entity)) return false;
    const w = entity.angularVelocity || 0;
    return Math.abs(w) <= SLEEP_ANGULAR_EPS;
}
/** Reset sleep counters on a kinetic body. */
export function wakeKineticBody(entity) {
    if (!isKinetic(entity)) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
}
/**
 * Advance per-frame sleep counter on a kinetic body.
 *
 * @param {object} entity
 * @param {boolean} eligible
 * @param {number} [requiredFrames]
 */
export function advanceKineticSleep(entity, eligible, requiredFrames = SLEEP_FRAMES) {
    if (!isKinetic(entity)) return;
    if (!eligible) {
        entity._sleepFrames = 0;
        entity.isSleeping = false;
        return;
    }
    entity._sleepFrames++;
    if (entity._sleepFrames >= requiredFrames) entity.isSleeping = true;
}
/**
 * @param {object} prop
 * @param {object[]} neighbors
 * @param {{ filter?: PairFilter, pairOverlaps?: (a: object, b: object) => boolean }} [opts]
 */
export function hasSleepBlockingOverlap(prop, neighbors, { filter = getInteractionPairFilter("kineticSleepBlocker"), pairOverlaps = pairBroadphaseOverlap } = {}) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === prop) continue;
        if (!filter.allows(prop, other)) continue;
        if (pairOverlaps(prop, other)) return true;
    }
    return false;
}
/**
 * Full sleep eligibility: motion still + no blocking neighbor overlap.
 *
 * @param {object} prop
 * @param {object[]} neighbors
 * @param {{ blocksSleep?: (entity: object) => boolean, filter?: PairFilter, pairOverlaps?: (a: object, b: object) => boolean }} [opts]
 */
export function evaluateKineticSleepEligible(prop, neighbors, opts = {}) {
    const { blocksSleep = () => false, filter, pairOverlaps } = opts;
    return canSleepKinetic(prop, { blocksSleep }) && !hasSleepBlockingOverlap(prop, neighbors, { filter, pairOverlaps });
}
