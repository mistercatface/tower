import { getCollisionSettings } from "../../../Core/GameCollisionSettings.js";
import { allowsKineticCollisionPair, isKinematicallyActive, shouldResolveKineticPair } from "./entityBroadphase.js";
import { kineticDynamicSlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab } from "./kineticBodySlab.js";
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
    dynamic: { preDvx: new Float32Array(MAX_KINETIC_PAIRS), preDvy: new Float32Array(MAX_KINETIC_PAIRS) },
    static: {
        tier: new Uint8Array(MAX_KINETIC_PAIRS),
        restitution: new Float32Array(MAX_KINETIC_PAIRS),
        friction: new Float32Array(MAX_KINETIC_PAIRS),
        warmStartPairKey: new Float64Array(MAX_KINETIC_PAIRS),
    },
    reset() {
        this.count = 0;
    },
};
export const persistedKineticPairBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_KINETIC_PAIRS),
    physIdB: new Int32Array(MAX_KINETIC_PAIRS),
    dynamic: { preDvx: new Float32Array(MAX_KINETIC_PAIRS), preDvy: new Float32Array(MAX_KINETIC_PAIRS) },
    static: {
        tier: new Uint8Array(MAX_KINETIC_PAIRS),
        restitution: new Float32Array(MAX_KINETIC_PAIRS),
        friction: new Float32Array(MAX_KINETIC_PAIRS),
        warmStartPairKey: new Float64Array(MAX_KINETIC_PAIRS),
    },
    reset() {
        this.count = 0;
    },
};
export function copyKineticPairBuffer(from, to) {
    to.count = from.count;
    for (let i = 0; i < from.count; i++) {
        to.physIdA[i] = from.physIdA[i];
        to.physIdB[i] = from.physIdB[i];
        to.dynamic.preDvx[i] = from.dynamic.preDvx[i];
        to.dynamic.preDvy[i] = from.dynamic.preDvy[i];
        to.static.tier[i] = from.static.tier[i];
        to.static.restitution[i] = from.static.restitution[i];
        to.static.friction[i] = from.static.friction[i];
        to.static.warmStartPairKey[i] = from.static.warmStartPairKey[i];
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
    pairs.static.restitution[index] = kineticPairRestitution(bodyA, bodyB);
    pairs.static.friction[index] = kineticPairFriction(bodyA, bodyB);
    pairs.static.warmStartPairKey[index] = bodyA.id < bodyB.id ? bodyA.id * PAIR_BODY_KEY_SCALE + bodyB.id : bodyB.id * PAIR_BODY_KEY_SCALE + bodyA.id;
}
export function refreshKineticPairRelativeVelocities(pairs) {
    const slab = kineticDynamicSlab;
    for (let i = 0; i < pairs.count; i++) {
        const physIdA = pairs.physIdA[i];
        const physIdB = pairs.physIdB[i];
        pairs.dynamic.preDvx[i] = slab.vx[physIdB] - slab.vx[physIdA];
        pairs.dynamic.preDvy[i] = slab.vy[physIdB] - slab.vy[physIdA];
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
        const tier = pairs.static.tier[i];
        const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSlab(physIdA, physIdB) : pairBroadphaseOverlapSlab(physIdA, physIdB);
        if (!overlaps) continue;
        if (!shouldResolveKineticPair(bodyA, bodyB, overlaps)) continue;
        if (write !== i) {
            pairs.physIdA[write] = physIdA;
            pairs.physIdB[write] = physIdB;
            pairs.dynamic.preDvx[write] = pairs.dynamic.preDvx[i];
            pairs.dynamic.preDvy[write] = pairs.dynamic.preDvy[i];
            pairs.static.tier[write] = tier;
            pairs.static.restitution[write] = pairs.static.restitution[i];
            pairs.static.friction[write] = pairs.static.friction[i];
            pairs.static.warmStartPairKey[write] = pairs.static.warmStartPairKey[i];
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
    const slab = kineticDynamicSlab;
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
            pairs.dynamic.preDvx[idx] = slab.vx[physIdB] - slab.vx[physIdA];
            pairs.dynamic.preDvy[idx] = slab.vy[physIdB] - slab.vy[physIdA];
            pairs.static.tier[idx] = tier;
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
    return kineticContactBodiesAt(spatialFrame, physIdA, physIdB);
}
export function kineticContactBodiesAt(spatialFrame, physIdA, physIdB) {
    const bodyA = kineticPairBodyAt(spatialFrame, physIdA);
    const bodyB = kineticPairBodyAt(spatialFrame, physIdB);
    if (!bodyA || !bodyB) return null;
    return { bodyA, bodyB };
}
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    pairs.reset();
    const slab = kineticDynamicSlab;
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
            pairs.dynamic.preDvx[idx] = slab.vx[physIdB] - slab.vx[physIdA];
            pairs.dynamic.preDvy[idx] = slab.vy[physIdB] - slab.vy[physIdA];
            pairs.static.tier[idx] = tier;
            writePairMaterial(pairs, idx, primary, neighbor);
        }
    }
}
