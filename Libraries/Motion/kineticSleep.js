import { collisionSettings } from "../Collision/collisionDefaults.js";
import { createAabb, emptyAabbInto, growAabbFromCenterInto } from "../Math/Aabb2D.js";
import { entityBroadphaseExtent, isKinematicallyActive, pairBroadphaseOverlapSnapshotted } from "../Spatial/collision/entityBroadphase.js";
import { shareKineticIsland } from "./kineticIslands.js";
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
import { sleepContactBuffer } from "../Spatial/collision/kineticContactSolver.js";
const parent = new Int32Array(MAX_PHYS_BODIES);
const rank = new Int32Array(MAX_PHYS_BODIES);
const componentRoot = new Int32Array(MAX_PHYS_BODIES);
const componentMaxSpeedSq = new Float32Array(MAX_PHYS_BODIES);
const componentHasBlocker = new Uint8Array(MAX_PHYS_BODIES);
const componentMemberCount = new Int32Array(MAX_PHYS_BODIES);
function find(i) {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
        let nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
    }
    return root;
}
function union(i, j) {
    let rootI = find(i);
    let rootJ = find(j);
    if (rootI !== rootJ)
        if (rank[rootI] < rank[rootJ]) parent[rootI] = rootJ;
        else if (rank[rootI] > rank[rootJ]) parent[rootJ] = rootI;
        else {
            parent[rootJ] = rootI;
            rank[rootI]++;
        }
}
const bodyByPhysId = new Array(MAX_PHYS_BODIES);
export function advanceKineticSleepIslands(frame, session, contacts = sleepContactBuffer) {
    const activeBodies = frame._activeKineticBodies;
    if (!activeBodies || activeBodies.length === 0) return;
    parent.fill(-1);
    rank.fill(0);
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        parent[physId] = physId;
        bodyByPhysId[physId] = body;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const peers = body._kineticIslandPeers;
        if (peers)
            for (let j = 0; j < peers.length; j++) {
                const peer = peers[j];
                if (peer === body) continue;
                const peerPhysId = peer._physId;
                if (peerPhysId === undefined || peerPhysId === -1) continue;
                if (parent[peerPhysId] === -1) parent[peerPhysId] = peerPhysId;
                union(physId, peerPhysId);
            }
    }
    if (contacts && contacts.count > 0)
        for (let i = 0; i < contacts.count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            if (parent[physIdA] === -1 || parent[physIdB] === -1) continue;
            const bodyA = bodyByPhysId[physIdA];
            const bodyB = bodyByPhysId[physIdB];
            if (!bodyA || !bodyB) continue;
            const isResting = contacts.resting[i] === 1;
            const eitherActive = isKinematicallyActive(bodyA) || isKinematicallyActive(bodyB);
            if (isResting || eitherActive) union(physIdA, physIdB);
        }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = find(physId);
        componentRoot[physId] = root;
        componentMaxSpeedSq[root] = 0;
        componentHasBlocker[root] = 0;
        componentMemberCount[root] = 0;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = componentRoot[physId];
        const vx = body.vx || 0;
        const vy = body.vy || 0;
        const speedSq = vx * vx + vy * vy;
        if (speedSq > componentMaxSpeedSq[root]) componentMaxSpeedSq[root] = speedSq;
        if (!canSleepKinetic(body)) componentHasBlocker[root] = 1;
        componentMemberCount[root]++;
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const body = activeBodies[i];
        const physId = body._physId;
        if (physId === undefined || physId === -1) continue;
        const root = componentRoot[physId];
        const eligible = componentHasBlocker[root] === 0;
        advanceKineticSleep(body, eligible);
    }
    for (let i = 0; i < activeBodies.length; i++) {
        const physId = activeBodies[i]._physId;
        if (physId !== undefined && physId !== -1) bodyByPhysId[physId] = undefined;
    }
}
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
