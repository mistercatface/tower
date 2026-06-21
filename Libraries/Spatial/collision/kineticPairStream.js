import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { allowsKineticCollisionPair, isKinematicallyActive, shouldResolveKineticPair } from "./entityBroadphase.js";
import { kineticBodySlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab } from "./kineticBodySlab.js";
import { classifyKineticPairTier, KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { shareKineticIsland } from "../../Motion/kineticIslands.js";
import { kineticPairTopologyStale } from "../../Motion/kineticTopology.js";
const MAX_KINETIC_PAIRS = 4096;
const MAX_PHYS_BODIES = 4096;
const PAIR_BODY_KEY_SCALE = 1_000_000;
export const kineticPairBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_KINETIC_PAIRS),
    physIdB: new Int32Array(MAX_KINETIC_PAIRS),
    preDvx: new Float32Array(MAX_KINETIC_PAIRS),
    preDvy: new Float32Array(MAX_KINETIC_PAIRS),
    tier: new Uint8Array(MAX_KINETIC_PAIRS),
    restitution: new Float32Array(MAX_KINETIC_PAIRS),
    friction: new Float32Array(MAX_KINETIC_PAIRS),
    warmStartPairKey: new Float64Array(MAX_KINETIC_PAIRS),
    reset() {
        this.count = 0;
    },
};
export const persistedKineticPairBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_KINETIC_PAIRS),
    physIdB: new Int32Array(MAX_KINETIC_PAIRS),
    preDvx: new Float32Array(MAX_KINETIC_PAIRS),
    preDvy: new Float32Array(MAX_KINETIC_PAIRS),
    tier: new Uint8Array(MAX_KINETIC_PAIRS),
    restitution: new Float32Array(MAX_KINETIC_PAIRS),
    friction: new Float32Array(MAX_KINETIC_PAIRS),
    warmStartPairKey: new Float64Array(MAX_KINETIC_PAIRS),
    reset() {
        this.count = 0;
    },
};
export function copyKineticPairBuffer(from, to) {
    to.count = from.count;
    for (let i = 0; i < from.count; i++) {
        to.physIdA[i] = from.physIdA[i];
        to.physIdB[i] = from.physIdB[i];
        to.preDvx[i] = from.preDvx[i];
        to.preDvy[i] = from.preDvy[i];
        to.tier[i] = from.tier[i];
        to.restitution[i] = from.restitution[i];
        to.friction[i] = from.friction[i];
        to.warmStartPairKey[i] = from.warmStartPairKey[i];
    }
}
function pairMaterialFriction(body) {
    const pair = body.strategy?.pairFriction;
    if (pair != null) return pair;
    return body.strategy?.wallPhysics?.friction ?? null;
}
function kineticPairRestitution(bodyA, bodyB) {
    const r1 = bodyA.strategy?.pairRestitution;
    const r2 = bodyB.strategy?.pairRestitution;
    if (r1 != null && r2 != null) return (r1 + r2) * 0.5;
    return r1 ?? r2 ?? getCollisionSettings().restitution.kineticPair;
}
function kineticPairFriction(bodyA, bodyB) {
    const f1 = pairMaterialFriction(bodyA);
    const f2 = pairMaterialFriction(bodyB);
    if (f1 != null && f2 != null) return Math.sqrt(f1 * f2);
    return f1 ?? f2 ?? getCollisionSettings().pairFriction;
}
function writePairMaterial(pairs, index, bodyA, bodyB) {
    pairs.restitution[index] = kineticPairRestitution(bodyA, bodyB);
    pairs.friction[index] = kineticPairFriction(bodyA, bodyB);
    pairs.warmStartPairKey[index] = bodyA.id < bodyB.id ? bodyA.id * PAIR_BODY_KEY_SCALE + bodyB.id : bodyB.id * PAIR_BODY_KEY_SCALE + bodyA.id;
}
export function refreshKineticPairRelativeVelocities(pairs) {
    const slab = kineticBodySlab;
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        pairs.preDvx[i] = slab.vx[physIdB] - slab.vx[physIdA];
        pairs.preDvy[i] = slab.vy[physIdB] - slab.vy[physIdA];
    }
}
export function pairPhysKey(physIdA, physIdB) {
    return physIdA < physIdB ? physIdA * MAX_PHYS_BODIES + physIdB : physIdB * MAX_PHYS_BODIES + physIdA;
}
const compactPairKeyScratch = new Set();
export function compactSubstepKineticPairs(spatialFrame, pairs) {
    if (kineticPairTopologyStale(spatialFrame)) {
        pairs.count = 0;
        return false;
    }
    let write = 0;
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
        const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
        if (!bodyA || !bodyB) continue;
        if (shareKineticIsland(bodyA, bodyB)) continue;
        const tier = pairs.tier[i];
        const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
        if (!overlaps) continue;
        if (!shouldResolveKineticPair(bodyA, bodyB, overlaps)) continue;
        if (write !== i) {
            pairs.physIdA[write] = physIdA;
            pairs.physIdB[write] = physIdB;
            pairs.preDvx[write] = pairs.preDvx[i];
            pairs.preDvy[write] = pairs.preDvy[i];
            pairs.tier[write] = tier;
            pairs.restitution[write] = pairs.restitution[i];
            pairs.friction[write] = pairs.friction[i];
            pairs.warmStartPairKey[write] = pairs.warmStartPairKey[i];
        }
        write++;
    }
    pairs.count = write;
    return true;
}
export function patchKineticPairsForBodies(spatialFrame, pairs, bodies) {
    if (!bodies.length) return 0;
    const keys = compactPairKeyScratch;
    keys.clear();
    for (let i = 0; i < pairs.count; i++) keys.add(pairPhysKey(pairs.physIdA[i], pairs.physIdB[i]));
    const slab = kineticBodySlab;
    let added = 0;
    const seenPrimary = new Set();
    for (let i = 0; i < bodies.length; i++) {
        const primary = bodies[i];
        if (seenPrimary.has(primary)) continue;
        seenPrimary.add(primary);
        const physIdA = primary._physId;
        if (physIdA === undefined) continue;
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const key = pairPhysKey(physIdA, physIdB);
            if (keys.has(key)) continue;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (neighbor.isSleeping && isKinematicallyActive(primary) && overlaps) spatialFrame.activateKineticBody(neighbor);
            if (shareKineticIsland(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) return added;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.preDvx[idx] = slab.vx[physIdB] - slab.vx[physIdA];
            pairs.preDvy[idx] = slab.vy[physIdB] - slab.vy[physIdA];
            pairs.tier[idx] = tier;
            writePairMaterial(pairs, idx, primary, neighbor);
            keys.add(key);
            added++;
        }
    }
    return added;
}
export function kineticPairBodyAt(spatialFrame, physId) {
    const body = spatialFrame.entityGrid.entities[physId];
    if (!body || body._physId !== physId) return null;
    return body;
}
export function kineticPairBodiesAt(spatialFrame, physIdA, physIdB) {
    if (kineticPairTopologyStale(spatialFrame)) return null;
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    if (!bodyA || !bodyB) return null;
    return { bodyA, bodyB };
}
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    pairs.reset();
    const slab = kineticBodySlab;
    for (let i = 0; i < slab.activePhysCount; i++) {
        const physIdA = slab.activePhysIds[i];
        const primary = kineticPairBodyAt(spatialFrame, physIdA);
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const physIdB = neighbor._physId;
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
            if (neighbor.isSleeping && isKinematicallyActive(primary) && overlaps) spatialFrame.activateKineticBody(neighbor);
            if (shareKineticIsland(primary, neighbor)) continue;
            if (!allowsKineticCollisionPair(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) continue;
            const idx = pairs.count++;
            pairs.physIdA[idx] = physIdA;
            pairs.physIdB[idx] = physIdB;
            pairs.preDvx[idx] = slab.vx[physIdB] - slab.vx[physIdA];
            pairs.preDvy[idx] = slab.vy[physIdB] - slab.vy[physIdA];
            pairs.tier[idx] = tier;
            writePairMaterial(pairs, idx, primary, neighbor);
        }
    }
}
