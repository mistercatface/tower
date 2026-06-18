import { getCollisionSettings } from "../../Core/GameCollisionSettings.js";
import { isKinematicallyActive, pairBroadphaseOverlap } from "../Spatial/collision/entityBroadphase.js";
import { shareKineticIsland } from "./kineticIslands.js";
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
    const peers = entity._kineticIslandPeers;
    if (!peers) return;
    for (let i = 0; i < peers.length; i++) {
        const peer = peers[i];
        if (peer === entity) continue;
        peer._sleepFrames = 0;
        peer.isSleeping = false;
    }
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
export function hasSleepBlockingNeighbor(prop, neighbors, { pairOverlaps = pairBroadphaseOverlap, skipNeighbor = () => false } = {}) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === prop || !isKineticSleepNeighbor(other)) continue;
        if (skipNeighbor(prop, other)) continue;
        if (!pairOverlaps(prop, other)) continue;
        if (other.isSleeping) continue;
        if (isKinematicallyActive(other)) return true;
    }
    return false;
}
export function evaluateKineticSleepEligible(prop, neighbors, { blocksSleep = () => false, pairOverlaps } = {}) {
    return canSleepKinetic(prop, { blocksSleep }) && !hasSleepBlockingNeighbor(prop, neighbors, { pairOverlaps, skipNeighbor: shareKineticIsland });
}
export function evaluateKineticIslandSleepEligible(islandMembers, spatialFrame, { blocksSleep = () => false, pairOverlaps = pairBroadphaseOverlap } = {}) {
    for (let i = 0; i < islandMembers.length; i++) if (!canSleepKinetic(islandMembers[i], { blocksSleep })) return false;
    for (let i = 0; i < islandMembers.length; i++) {
        const prop = islandMembers[i];
        if (hasSleepBlockingNeighbor(prop, spatialFrame.getNeighbors(prop), { pairOverlaps, skipNeighbor: shareKineticIsland })) return false;
    }
    return true;
}
