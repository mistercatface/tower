import { collisionSettings } from "../Collision/collisionDefaults.js";
import { createAabb, emptyAabbInto, growAabbFromCenterInto } from "../Math/Aabb2D.js";
import { entityBroadphaseExtent, isKinematicallyActive, pairBroadphaseOverlapSnapshotted } from "../Spatial/collision/entityBroadphase.js";
import { shareKineticIsland } from "./kineticIslands.js";
const ISLAND_SLEEP_QUERY_BOUNDS = createAabb();
export function kineticSleepFramesRequired() {
    return collisionSettings.kineticSleep.frames;
}
export function isKinetic(entity) {
    return Boolean(entity?.strategy?.isKinetic);
}
function propBlocksSleep(prop) {
    const fn = prop.currentState?.blocksSleep;
    if (fn) return fn.call(prop.currentState);
    return false;
}
export function canSleepKinetic(entity) {
    if (!isKinetic(entity)) return false;
    if (propBlocksSleep(entity)) return false;
    return !isKinematicallyActive(entity);
}
export function wakeKineticBody(entity) {
    if (!isKinetic(entity)) return;
    if (!entity.isSleeping && entity._sleepFrames === 0) return;
    entity._sleepFrames = 0;
    entity.isSleeping = false;
    const linked = entity._kineticLinkNeighbors;
    if (linked?.length) {
        for (let i = 0; i < linked.length; i++) {
            const peer = linked[i];
            if (peer === entity) continue;
            peer._sleepFrames = 0;
            peer.isSleeping = false;
        }
        return;
    }
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
export function hasSleepBlockingNeighbor(prop, neighbors) {
    for (let i = 0; i < neighbors.length; i++) {
        const other = neighbors[i];
        if (other === prop || !isKineticSleepNeighbor(other)) continue;
        if (shareKineticIsland(prop, other)) continue;
        if (!pairBroadphaseOverlapSnapshotted(prop, other)) continue;
        if (other.isSleeping) continue;
        if (isKinematicallyActive(other)) return true;
    }
    return false;
}
export function evaluateKineticSleepEligible(prop, neighbors) {
    return canSleepKinetic(prop) && !hasSleepBlockingNeighbor(prop, neighbors);
}
export function evaluateKineticIslandSleepEligible(islandMembers, spatialFrame) {
    emptyAabbInto(ISLAND_SLEEP_QUERY_BOUNDS);
    for (let i = 0; i < islandMembers.length; i++) {
        const prop = islandMembers[i];
        if (!canSleepKinetic(prop)) return false;
        const extent = entityBroadphaseExtent(prop);
        growAabbFromCenterInto(ISLAND_SLEEP_QUERY_BOUNDS, prop.x, prop.y, extent, extent);
    }
    const neighbors = spatialFrame.collectEntitiesInBounds(ISLAND_SLEEP_QUERY_BOUNDS);
    for (let i = 0; i < islandMembers.length; i++) if (hasSleepBlockingNeighbor(islandMembers[i], neighbors)) return false;
    return true;
}
