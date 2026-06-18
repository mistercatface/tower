import { allowsKineticCollisionPairSnapshotted, isKinematicallyActive, pairBroadphaseOverlapSnapshotted, pairCircleCircleOverlapSnapshotted } from "./entityBroadphase.js";
import { classifyKineticPairTier, KINETIC_PAIR_TIER } from "./kineticNarrowPhase.js";
import { shareKineticIsland } from "../../Motion/kineticIslands.js";
const MAX_KINETIC_PAIRS = 4096;
export const kineticPairBuffer = {
    count: 0,
    bodyA: new Array(MAX_KINETIC_PAIRS),
    bodyB: new Array(MAX_KINETIC_PAIRS),
    preDvx: new Float32Array(MAX_KINETIC_PAIRS),
    preDvy: new Float32Array(MAX_KINETIC_PAIRS),
    tier: new Uint8Array(MAX_KINETIC_PAIRS),
    reset() {
        this.count = 0;
    },
};
export function gatherKineticCandidatePairs(spatialFrame, pairs) {
    pairs.reset();
    const active = spatialFrame._activeKineticBodies;
    for (let i = 0; i < active.length; i++) {
        const primary = active[i];
        const neighbors = spatialFrame.getNeighbors(primary);
        for (let j = 0; j < neighbors.length; j++) {
            const neighbor = neighbors[j];
            const tier = classifyKineticPairTier(primary, neighbor);
            const overlaps = tier === KINETIC_PAIR_TIER.CIRCLE_CIRCLE ? pairCircleCircleOverlapSnapshotted(primary, neighbor) : pairBroadphaseOverlapSnapshotted(primary, neighbor);
            if (neighbor.isSleeping && isKinematicallyActive(primary) && overlaps) spatialFrame.activateKineticBody(neighbor);
            if (shareKineticIsland(primary, neighbor)) continue;
            if (!allowsKineticCollisionPairSnapshotted(primary, neighbor, overlaps)) continue;
            if (pairs.count >= MAX_KINETIC_PAIRS) continue;
            const idx = pairs.count++;
            pairs.bodyA[idx] = primary;
            pairs.bodyB[idx] = neighbor;
            pairs.preDvx[idx] = (neighbor.vx ?? 0) - (primary.vx ?? 0);
            pairs.preDvy[idx] = (neighbor.vy ?? 0) - (primary.vy ?? 0);
            pairs.tier[idx] = tier;
        }
    }
}
