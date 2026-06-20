import { allowsKineticCollisionPair, isKinematicallyActive } from "./entityBroadphase.js";
import { kineticBodySlab, pairBroadphaseOverlapSlab, pairCircleCircleOverlapSlab } from "./kineticBodySlab.js";
import { classifyKineticPairTier, KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { shareKineticIsland } from "../../Motion/kineticIslands.js";
import { kineticPairTopologyStale } from "../../Motion/kineticTopology.js";
const MAX_KINETIC_PAIRS = 4096;
export const kineticPairBuffer = {
    count: 0,
    physIdA: new Int32Array(MAX_KINETIC_PAIRS),
    physIdB: new Int32Array(MAX_KINETIC_PAIRS),
    preDvx: new Float32Array(MAX_KINETIC_PAIRS),
    preDvy: new Float32Array(MAX_KINETIC_PAIRS),
    tier: new Uint8Array(MAX_KINETIC_PAIRS),
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
    }
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
    const active = spatialFrame._activeKineticBodies;
    for (let i = 0; i < active.length; i++) {
        const primary = active[i];
        const physIdA = primary._physId;
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
            pairs.preDvx[idx] = (neighbor.vx ?? 0) - (primary.vx ?? 0);
            pairs.preDvy[idx] = (neighbor.vy ?? 0) - (primary.vy ?? 0);
            pairs.tier[idx] = tier;
        }
    }
}
