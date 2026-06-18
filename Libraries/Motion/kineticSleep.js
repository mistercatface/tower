import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { isKinematicallyActive, pairBroadphaseOverlap } from "../Spatial/collision/entityBroadphase.js";
export function kineticSleepFramesRequired() {
    return getCollisionSettings().kineticSleep.frames;
}
export function isKinetic(entity) {
    return Boolean(entity?.strategy?.isKinetic);
}
export function canSleepKinetic(entity, { blocksSleep = () => false } = {}) {
    if (!isKinetic(entity)) return false;
    if (blocksSleep(entity)) return false;
    return !isKinematicallyActive(entity);
}
export function wakeKineticBody(entity) {
    if (!isKinetic(entity)) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
}
export function advanceKineticSleep(entity, eligible, requiredFrames = kineticSleepFramesRequired()) {
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
    return Boolean(other.strategy?.isKinetic);
}
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
