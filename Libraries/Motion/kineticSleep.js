import { isKinematicallyActive, isMovingEntity, pairBroadphaseOverlap } from "../Spatial/collision/entityBroadphase.js";
/** Consecutive still frames required before a kinetic body is treated as sleeping. */
export const SLEEP_FRAMES = 30;
/** Max |angularVelocity| (rad/s) while counting toward sleep. */
export const SLEEP_ANGULAR_EPS = 0.1;
export function isKinetic(entity) {
    return Boolean(entity?.strategy?.isKinetic);
}
export function canSleepKinetic(entity, { blocksSleep = () => false } = {}) {
    if (!isKinetic(entity) || entity.isDead) return false;
    if (blocksSleep(entity)) return false;
    if (isMovingEntity(entity)) return false;
    const w = entity.angularVelocity || 0;
    return Math.abs(w) <= SLEEP_ANGULAR_EPS;
}
export function wakeKineticBody(entity) {
    if (!isKinetic(entity)) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
}
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
function isKineticSleepNeighbor(other) {
    if (other.isDead) return false;
    return Boolean(other.strategy?.isKinetic);
}
/** Awake kinematically active kinetic neighbors block sleep; resting piles and sleeping neighbors do not. */
export function hasSleepBlockingNeighbor(prop, neighbors, { pairOverlaps = pairBroadphaseOverlap } = {}) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === prop || !isKineticSleepNeighbor(other)) continue;
        if (!pairOverlaps(prop, other)) continue;
        if (other.isSleeping) continue;
        if (isKinematicallyActive(other)) return true;
    }
    return false;
}
export function evaluateKineticSleepEligible(prop, neighbors, { blocksSleep = () => false, pairOverlaps } = {}) {
    return canSleepKinetic(prop, { blocksSleep }) && !hasSleepBlockingNeighbor(prop, neighbors, { pairOverlaps });
}
