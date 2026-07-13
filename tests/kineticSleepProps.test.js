import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { readEntityFacing, SAT_RESULT, separateAlongNormalSlab, LIBRARY_COLLISION_DEFAULTS, advanceKineticSleep, evaluateKineticSleepEligible, hasSleepBlockingNeighbor, isKinematicallyActiveSlab, pairBroadphaseOverlapSlab, allowsKineticCollisionPairSlab, snapshotKineticBodySlab, normalizeKineticBody } from "../Libraries/Physics/physics.js";
import { satCheckCollision } from "./harness/satCollisionHarness.js";
import { entityRefs } from "../Core/engineMemory.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleepFrames;
const EMPTY_NEIGHBOR_EIDS = new Int32Array(0);
function bindPair(a, b) {
    assignPhysIdWithPose(a, 0);
    assignPhysIdWithPose(b, 1);
    entityRefs[0] = a;
    entityRefs[1] = b;
    snapshotKineticBodySlab([a._physId, b._physId], 2);
}
function neighborEids(...bodies) {
    const eids = new Int32Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) eids[i] = bodies[i]._physId;
    return eids;
}
function separatePairUntilClear(a, b, maxPasses = 8) {
    if (a._physId === undefined) assignPhysIdWithPose(a, 0);
    if (b._physId === undefined) assignPhysIdWithPose(b, 1);
    normalizeKineticBody(a);
    normalizeKineticBody(b);
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape);
        if (!collided || SAT_RESULT[0] < 1e-5) return;
        const overlap = SAT_RESULT[0];
        const nx = SAT_RESULT[1];
        const ny = SAT_RESULT[2];
        const coincident = SAT_RESULT[5] !== 0;
        if (coincident) return;
        separateAlongNormalSlab(a._physId, b._physId, nx, ny, overlap);
    }
}
describe("kinetic sleep on proof props", () => {
    it("isolated crate sleeps after consecutive still frames", () => {
        const crate = new WorldProp(0, 0, "box", 0);
        assignPhysIdWithPose(crate, 0);
        assert.ok(evaluateKineticSleepEligible(crate._physId, EMPTY_NEIGHBOR_EIDS, 0));
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(crate._physId, true);
        assert.equal(crate.isSleeping, true);
    });
    it("resting crate stack can sleep together", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 14, "box", 0);
        separatePairUntilClear(bottom, top);
        bindPair(bottom, top);
        const bottomN = neighborEids(top);
        const topN = neighborEids(bottom);
        assert.ok(evaluateKineticSleepEligible(bottom._physId, bottomN));
        assert.ok(evaluateKineticSleepEligible(top._physId, topN));
        for (let i = 0; i < SLEEP_FRAMES; i++) {
            advanceKineticSleep(bottom._physId, evaluateKineticSleepEligible(bottom._physId, bottomN));
            advanceKineticSleep(top._physId, evaluateKineticSleepEligible(top._physId, topN));
        }
        assert.equal(bottom.isSleeping, true);
        assert.equal(top.isSleeping, true);
    });
    it("moving neighbor blocks sleep", () => {
        const rest = new WorldProp(0, 0, "box", 0);
        const mover = new WorldProp(0, 14, "box", 0);
        separatePairUntilClear(rest, mover);
        bindPair(rest, mover);
        mover.vx = 5;
        snapshotKineticBodySlab([rest._physId, mover._physId], 2);
        const n = neighborEids(mover);
        assert.ok(hasSleepBlockingNeighbor(rest._physId, n));
        assert.ok(!evaluateKineticSleepEligible(rest._physId, n));
    });
    it("sleeping overlapping neighbor does not block sleep", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 14, "box", 0);
        separatePairUntilClear(bottom, top);
        bindPair(bottom, top);
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(top._physId, true);
        top.isSleeping = true;
        const n = neighborEids(top);
        assert.ok(!hasSleepBlockingNeighbor(bottom._physId, n));
        assert.ok(evaluateKineticSleepEligible(bottom._physId, n));
    });
    it("slow spin keeps tri wedge eligible for wall collision", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        wedge.vx = 0;
        wedge.vy = 0;
        wedge.angularVelocity = 0.12;
        assignPhysIdWithPose(wedge, 0);
        snapshotKineticBodySlab([wedge._physId], 1);
        assert.ok(isKinematicallyActiveSlab(wedge._physId));
    });
    it("motion resets sleep counter on proof props", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        assignPhysIdWithPose(hex, 0);
        for (let i = 0; i < SLEEP_FRAMES - 1; i++) advanceKineticSleep(hex._physId, true);
        hex.vx = 5;
        advanceKineticSleep(hex._physId, false);
        assert.equal(hex.isSleeping, false);
        assert.equal(hex._sleepFrames, 0);
    });
    it("resting overlapping pair skips contact resolve until something moves", () => {
        const a = new WorldProp(0, 0, "box", 0);
        const b = new WorldProp(0, 14, "box", 0);
        separatePairUntilClear(a, b);
        assignPhysIdWithPose(a, 0);
        assignPhysIdWithPose(b, 1);
        snapshotKineticBodySlab([a._physId, b._physId], 2);
        assert.ok(allowsKineticCollisionPairSlab(a._physId, b._physId, pairBroadphaseOverlapSlab(a._physId, b._physId)) === false);
        a.vx = 10;
        snapshotKineticBodySlab([a._physId, b._physId], 2);
        assert.ok(allowsKineticCollisionPairSlab(a._physId, b._physId, pairBroadphaseOverlapSlab(a._physId, b._physId)));
    });
});
