import { collisionSettings } from "./physicsDefaults.js";
import { applyGroundRollDrive } from "../Sandbox/kineticRollActuator.js";
import { gatherKineticConstraintSlab, measureConstraintSlabMaxError, resolveGatheredKineticConstraintSlab, getKineticConstraintGraph, getKineticConstraintsVersion } from "./kineticConstraintSolver.js";
import { ensureKineticContactPairs, resolveKineticContactPassWithPairs, kineticContactBuffer, sleepContactBuffer, persistedKineticPairBuffer } from "./kineticContactSolver.js";
import { refreshActiveKineticBodySlabPose, entityBroadphaseExtent, isKinematicallyActive, pairBroadphaseOverlapSnapshotted } from "./broadphase.js";
import { clampActiveKineticBodySlabSpeed, writebackActiveKineticBodySlab, kineticDynamicSlab } from "./physicsSlabs.js";
import { shouldResolveKineticBodyAgainstWalls } from "./wallResolution.js";
import { lengthXY } from "../Math/Vec2.js";
import { MAX_ENTITIES as MAX_PHYS_BODIES } from "../../Core/engineLimits.js";
import { createAabb, emptyAabbInto, growAabbFromCenterInto } from "../Math/Aabb2D.js";
// --- MERGED FROM kineticPhysicsPass.js ---
// Merged from collisionPipeline.js
function resolveActiveBodyWalls(activeBodies, frame, resolveWalls) {
    for (let i = 0; i < activeBodies.length; i++) {
        const prop = activeBodies[i];
        const wallCandidates = frame.getWallCandidates(prop);
        if (!shouldResolveKineticBodyAgainstWalls(prop, wallCandidates)) continue;
        resolveWalls(prop);
    }
}
/**
 * Kinetic collision substeps: contact solve + wall resolve.
 *
 * @param {{ frame: object, world: object }} tick
 * @param {{
 *   resolveWalls: (entity: object) => void,
 *   kineticIterations?: number,
 *   applyContactSideEffects?: (tick: object, contacts: object) => void,
 * }} hooks
 */
export function runCollisionPipeline(tick, { resolveWalls, kineticIterations = collisionSettings.kineticIterations, applyContactSideEffects } = {}) {
    const frame = tick.frame;
    const { velocityEpsilonSq, constraintErrorEpsilon } = collisionSettings.kineticEarlyOut;
    const activeBodies = frame._activeKineticBodies;
    const hasActiveBodies = activeBodies.length > 0;
    if (hasActiveBodies) for (let i = 0; i < activeBodies.length; i++) activeBodies[i]._wallResolveHits = null;
    let outerIterationsRun = 0;
    if (hasActiveBodies) {
        sleepContactBuffer.reset();
        gatherKineticConstraintSlab(tick);
        ensureKineticContactPairs(tick, persistedKineticPairBuffer);
        const patchBodies = tick.world.kinetic.substepPairPatchBodies ?? (tick.world.kinetic.substepPairPatchBodies = []);
        for (let iter = 0; iter < kineticIterations; iter++) {
            outerIterationsRun = iter + 1;
            resolveKineticContactPassWithPairs(tick, persistedKineticPairBuffer);
            applyContactSideEffects?.(tick, kineticContactBuffer);
            resolveGatheredKineticConstraintSlab(tick);
            const maxError = measureConstraintSlabMaxError();
            const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
            const settled = maxError <= constraintErrorEpsilon && maxSpeedSq <= velocityEpsilonSq;
            if (!settled || iter === 0) resolveActiveBodyWalls(activeBodies, frame, resolveWalls);
            frame.flushScheduledKineticActivations(patchBodies);
            clampActiveKineticBodySlabSpeed(1000);
            if (settled) break;
        }
        writebackActiveKineticBodySlab(activeBodies);
        refreshActiveKineticBodySlabPose(activeBodies);
        tick.world.kinetic.kineticSolverStats = { outerIterations: outerIterationsRun, maxIterations: kineticIterations };
    } else tick.world.kinetic.kineticSolverStats = { outerIterations: 0, maxIterations: kineticIterations };
}
export function runKineticPhysics(tick, dt, hooks) {
    const world = tick.world;
    world.sandbox?.simulationFrameHooks?.beforePhysics?.(world);
    const frame = tick.frame;
    const session = world.kinetic;
    ensureKineticIslandPlan(session, frame._kineticBodies);
    session.kineticConstraintsDirty = false;
    session.substepPairsValid = false;
    session.substepPairPatchBodies = session.substepPairPatchBodies ?? [];
    session.substepPairPatchBodies.length = 0;
    session.kineticPairGatherStats = { full: 0, refresh: 0, patch: 0 };
    const kineticBodies = frame._kineticBodies;
    for (let i = 0; i < kineticBodies.length; i++) if (kineticBodies[i]._groundRollDrive) wakeKineticBody(kineticBodies[i]);
    frame.syncActiveKineticBodies();
    const activeBodies = frame._activeKineticBodies;
    const { maxStepPx, maxSubsteps } = collisionSettings.motionSubsteps;
    const steps = countMotionSubsteps(dt, activeBodies, { maxStepPx, maxSubsteps });
    const subDt = dt / steps;
    const subDtSec = subDt / 1000;
    const { velocityEpsilonSq } = collisionSettings.kineticEarlyOut;
    let substepsRun = steps;
    const collisionHooks = { resolveWalls: (entity) => hooks.resolveWalls(entity, frame), applyContactSideEffects: hooks.applyContactSideEffects };
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < activeBodies.length; i++) applyGroundRollDrive(activeBodies[i], subDtSec, world);
        for (let i = world.worldProps.length - 1; i >= 0; i--) hooks.updateProp(world.worldProps[i], subDt, frame);
        const projectiles = world.projectiles || [];
        for (let i = projectiles.length - 1; i >= 0; i--) hooks.updateProp(projectiles[i], subDt, frame);
        frame.reindexKineticBodies(activeBodies);
        runCollisionPipeline(tick, collisionHooks);
        const maxSpeedSq = maxActiveKineticSpeedSq(activeBodies);
        const solverStats = world.kinetic.kineticSolverStats;
        const constraintsStable = !solverStats || solverStats.outerIterations < collisionSettings.kineticConstraints.iterations;
        if (s + 1 < steps && maxSpeedSq <= velocityEpsilonSq && constraintsStable) {
            substepsRun = s + 1;
            break;
        }
    }
    session.motionSubstepStats = { substepsRun, substepsPlanned: steps };
    advanceKineticSleepIslands(frame, session);
    frame.syncActiveKineticBodies();
    world.sandbox?.simulationFrameHooks?.afterPhysics?.(world);
    hooks.afterKineticPhysics?.(tick);
}

// --- MERGED FROM motionSubsteps.js ---
/**
 * Adaptive physics substep count from peak kinetic body displacement this tick.
 * Used by {@link runKineticPhysics}.
 *
 * @param {number} dtMs
 * @param {object[] | null | undefined} bodies
 * @param {{ maxStepPx?: number, maxSubsteps?: number }} [opts]
 * @returns {number}
 */
export function countMotionSubsteps(dtMs, bodies, { maxStepPx = 4, maxSubsteps = 8 } = {}) {
    if (!bodies?.length || dtMs <= 0 || maxStepPx <= 0) return 1;
    const dtSec = dtMs / 1000;
    let maxDisp = 0;
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        if (body.isSleeping) continue;
        const disp = lengthXY(body.vx ?? 0, body.vy ?? 0) * dtSec;
        if (disp > maxDisp) maxDisp = disp;
    }
    if (maxDisp <= 1e-6) return 1;
    return Math.min(maxSubsteps, Math.max(1, Math.ceil(maxDisp / maxStepPx)));
}

/** @param {object[] | null | undefined} bodies */
export function maxActiveKineticSpeedSq(bodies) {
    let max = 0;
    if (!bodies?.length) return max;
    for (let i = 0; i < bodies.length; i++) {
        const vx = bodies[i].vx ?? 0;
        const vy = bodies[i].vy ?? 0;
        const sq = vx * vx + vy * vy;
        if (sq > max) max = sq;
    }
    return max;
}

// --- MERGED FROM kineticIslands.js ---
function clearBodyIslandFields(body) {
    delete body._kineticLinkNeighbors;
    delete body._kineticIslandPeers;
    delete body._kineticIslandRoot;
}
export function bakeKineticIslandPlan(session, kineticBodies) {
    const adjacent = getKineticConstraintGraph(session);
    const bodyById = new Map();
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        bodyById.set(body.id, body);
        clearBodyIslandFields(body);
        if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = -1;
    }
    for (let i = 0; i < kineticBodies.length; i++) {
        const body = kineticBodies[i];
        const neighborIds = adjacent.get(body.id);
        let linkNeighbors = null;
        if (neighborIds)
            for (let j = 0; j < neighborIds.length; j++) {
                const neighbor = bodyById.get(neighborIds[j]);
                if (!neighbor) continue;
                if (!linkNeighbors) linkNeighbors = [];
                linkNeighbors.push(neighbor);
            }
        if (linkNeighbors) body._kineticLinkNeighbors = linkNeighbors;
    }
    const assigned = new Set();
    for (let i = 0; i < kineticBodies.length; i++) {
        const start = kineticBodies[i];
        if (assigned.has(start.id)) continue;
        const memberBodies = [];
        const seen = new Set([start.id]);
        const stack = [start.id];
        while (stack.length > 0) {
            const id = stack.pop();
            const body = bodyById.get(id);
            if (body) memberBodies.push(body);
            const neighborIds = adjacent.get(id);
            if (!neighborIds) continue;
            for (let k = 0; k < neighborIds.length; k++) {
                const neighborId = neighborIds[k];
                if (!seen.has(neighborId)) {
                    seen.add(neighborId);
                    stack.push(neighborId);
                }
            }
        }
        const root = memberBodies[0].id;
        const multiBody = memberBodies.length > 1;
        for (let m = 0; m < memberBodies.length; m++) {
            const body = memberBodies[m];
            assigned.add(body.id);
            body._kineticIslandRoot = root;
            if (body._physId !== undefined) kineticDynamicSlab.islandRoot[body._physId] = root;
            if (multiBody) body._kineticIslandPeers = memberBodies;
        }
    }
    session._kineticIslandPlan = { version: getKineticConstraintsVersion(session) };
}
export function ensureKineticIslandPlan(session, kineticBodies) {
    const version = getKineticConstraintsVersion(session);
    const plan = session._kineticIslandPlan;
    if (plan && plan.version === version) return plan;
    bakeKineticIslandPlan(session, kineticBodies);
    return session._kineticIslandPlan;
}
export function shareKineticIsland(bodyA, bodyB) {
    if (bodyA._kineticIslandRoot !== bodyB._kineticIslandRoot) return false;
    return Boolean(bodyA._kineticIslandPeers);
}
export function kineticIslandMembers(body) {
    return body._kineticIslandPeers ?? [body];
}

// --- MERGED FROM kineticSleep.js ---
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

