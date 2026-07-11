import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { satCheckCollision, entityFacing, SAT_RESULT } from "../Libraries/Physics/physics.js";
import { separateAlongNormal } from "../Libraries/Physics/physics.js";
import { LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Physics/physics.js";
import { advanceKineticSleep, evaluateKineticSleepEligible, hasSleepBlockingNeighbor } from "../Libraries/Physics/physics.js";
import { isRotatingEntity, pairBroadphaseOverlapSlab, shouldResolveKineticPair, snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { entityRefs } from "../Core/engineMemory.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
const SLEEP_FRAMES = LIBRARY_COLLISION_DEFAULTS.kineticSleep.frames;
const EMPTY_NEIGHBOR_EIDS = new Int32Array(0);
function bindPair(a, b) {
    assignPhysIdWithPose(a, 0);
    assignPhysIdWithPose(b, 1);
    entityRefs[0] = a;
    entityRefs[1] = b;
    snapshotKineticBodySlab([a, b]);
}
function neighborEids(...bodies) {
    const eids = new Int32Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) eids[i] = bodies[i]._physId;
    return eids;
}
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = satCheckCollision(a.x, a.y, entityFacing(a), a.shape, b.x, b.y, entityFacing(b), b.shape);
        if (!collided) return;
        const overlap = SAT_RESULT[0];
        const nx = SAT_RESULT[1];
        const ny = SAT_RESULT[2];
        const coincident = SAT_RESULT[5] !== 0;
        if (coincident) return;
        separateAlongNormal(a, b, nx, ny, overlap, a.mass, b.mass);
    }
}
describe("kinetic sleep on proof props", () => {
    it("isolated crate sleeps after consecutive still frames", () => {
        const crate = new WorldProp(0, 0, "crate", 0);
        assert.ok(evaluateKineticSleepEligible(crate, EMPTY_NEIGHBOR_EIDS, 0));
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(crate, true);
        assert.equal(crate.isSleeping, true);
    });
    it("resting crate stack can sleep together", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        bindPair(bottom, top);
        const bottomN = neighborEids(top);
        const topN = neighborEids(bottom);
        assert.ok(evaluateKineticSleepEligible(bottom, bottomN));
        assert.ok(evaluateKineticSleepEligible(top, topN));
        for (let i = 0; i < SLEEP_FRAMES; i++) {
            advanceKineticSleep(bottom, evaluateKineticSleepEligible(bottom, bottomN));
            advanceKineticSleep(top, evaluateKineticSleepEligible(top, topN));
        }
        assert.equal(bottom.isSleeping, true);
        assert.equal(top.isSleeping, true);
    });
    it("moving neighbor blocks sleep", () => {
        const rest = new WorldProp(0, 0, "crate", 0);
        const mover = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(rest, mover);
        bindPair(rest, mover);
        mover.vx = 5;
        snapshotKineticBodySlab([rest, mover]);
        const n = neighborEids(mover);
        assert.ok(hasSleepBlockingNeighbor(rest, n));
        assert.ok(!evaluateKineticSleepEligible(rest, n));
    });
    it("sleeping overlapping neighbor does not block sleep", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        bindPair(bottom, top);
        for (let i = 0; i < SLEEP_FRAMES; i++) advanceKineticSleep(top, true);
        top.isSleeping = true;
        const n = neighborEids(top);
        assert.ok(!hasSleepBlockingNeighbor(bottom, n));
        assert.ok(evaluateKineticSleepEligible(bottom, n));
    });
    it("slow spin keeps tri wedge eligible for wall collision", () => {
        const wedge = new WorldProp(0, 0, "tri_wedge", 0);
        wedge.vx = 0;
        wedge.vy = 0;
        wedge.angularVelocity = 0.12;
        assert.ok(wedge.needsWallCollision());
        assert.ok(isRotatingEntity(wedge));
    });
    it("motion resets sleep counter on proof props", () => {
        const hex = new WorldProp(0, 0, "hex_block", 0);
        for (let i = 0; i < SLEEP_FRAMES - 1; i++) advanceKineticSleep(hex, true);
        hex.vx = 5;
        advanceKineticSleep(hex, false);
        assert.equal(hex.isSleeping, false);
        assert.equal(hex._sleepFrames, 0);
    });
    it("resting overlapping pair skips contact resolve until something moves", () => {
        const a = new WorldProp(0, 0, "crate", 0);
        const b = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(a, b);
        assignPhysIdWithPose(a, 0);
        assignPhysIdWithPose(b, 1);
        snapshotKineticBodySlab([a, b]);
        assert.ok(shouldResolveKineticPair(a, b, pairBroadphaseOverlapSlab(a._physId, b._physId)) === false);
        a.vx = 10;
        snapshotKineticBodySlab([a, b]);
        assert.ok(shouldResolveKineticPair(a, b, pairBroadphaseOverlapSlab(a._physId, b._physId)));
    });
});
