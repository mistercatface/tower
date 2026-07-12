import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Libraries/Props/props.js";
import { satCheckCollision, readEntityFacing, SAT_RESULT } from "../Libraries/Physics/physics.js";
import { separateAlongNormal } from "../Libraries/Physics/physics.js";
import { allowsKineticCollisionPair, pairBroadphaseOverlapSlab, snapshotKineticBodySlab } from "../Libraries/Physics/physics.js";
import { gatherKineticCandidatePairs } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab, entityRefs, kineticPairBuffer } from "../Core/engineMemory.js";
import { createKineticTestTick, mockKineticCircle, setupKineticTestFrame, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { kineticMassFromFootprint } from "../Libraries/Physics/physics.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";

const pairBuffer = kineticPairBuffer;
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = satCheckCollision(a.x, a.y, readEntityFacing(a), a.shape, b.x, b.y, readEntityFacing(b), b.shape);
        if (!collided) return;
        const overlap = SAT_RESULT[0];
        const nx = SAT_RESULT[1];
        const ny = SAT_RESULT[2];
        const coincident = SAT_RESULT[5] !== 0;
        if (coincident) return;
        separateAlongNormal(a, b, nx, ny, overlap, kineticMassFromFootprint(a), kineticMassFromFootprint(b));
    }
}
function pairKeys(pairs, spatialFrame) {
    const keys = [];
    for (let i = 0; i < pairs.count; i++) {
        const bodyA = (entityRefs[pairs.physIdA[i]]?._physId === pairs.physIdA[i] ? entityRefs[pairs.physIdA[i]] : null);
        const bodyB = (entityRefs[pairs.physIdB[i]]?._physId === pairs.physIdB[i] ? entityRefs[pairs.physIdB[i]] : null);
        const lo = Math.min(bodyA.id, bodyB.id);
        const hi = Math.max(bodyA.id, bodyB.id);
        keys.push(lo * 1_000_000 + hi);
    }
    keys.sort((a, b) => a - b);
    return keys;
}
describe("kinetic pair stream", () => {
    it("snapshotted broadphase overlap detects touching circles", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotKineticBodySlab([a, b]);
        assert.ok(pairBroadphaseOverlapSlab(a._physId, b._physId));
    });
    it("slab-backed pair policy resolves resting overlap only when mover is active", () => {
        const rest = mockKineticCircle(0, 0, 10, 0, 0);
        const mover = mockKineticCircle(18, 0, 10, 20, 0);
        assignPhysIdWithPose(rest, 0);
        assignPhysIdWithPose(mover, 1);
        snapshotKineticBodySlab([rest, mover]);
        assert.ok(allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlapSlab(rest._physId, mover._physId)));
        rest.vx = 0;
        mover.vx = 0;
        snapshotKineticBodySlab([rest, mover]);
        assert.equal(allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlapSlab(rest._physId, mover._physId)), false);
    });
    it("resting overlapping circles emit no candidate pairs", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(18, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, pairBuffer);
        assert.equal(pairBuffer.count, 0);
    });
    it("moving circle against resting neighbor emits one ordered pair", () => {
        const a = mockKineticCircle(0, 0, 10, 30, 0);
        const b = mockKineticCircle(18, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, pairBuffer);
        assert.equal(pairBuffer.count, 1);
        assert.equal((entityRefs[pairBuffer.physIdA[0]]?._physId === pairBuffer.physIdA[0] ? entityRefs[pairBuffer.physIdA[0]] : null).id, a.id);
        assert.equal((entityRefs[pairBuffer.physIdB[0]]?._physId === pairBuffer.physIdB[0] ? entityRefs[pairBuffer.physIdB[0]] : null).id, b.id);
    });
    it("three-body contact emits each pair once", () => {
        const left = mockKineticCircle(0, 0, 10, 0, 0);
        const center = mockKineticCircle(18, 0, 10, 25, 0);
        const right = mockKineticCircle(36, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([left, center, right]);
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, pairBuffer);
        assert.deepEqual(pairKeys(pairBuffer, frame), [left.id * 1_000_000 + center.id, center.id * 1_000_000 + right.id]);
    });
    it("moving body wakes sleeping overlapping neighbor during contact pass", () => {
        const mover = mockKineticCircle(0, 0, 10, 40, 0);
        const sleeper = mockKineticCircle(18, 0, 10, 0, 0);
        sleeper.isSleeping = true;
        const tick = createKineticTestTick([mover, sleeper]);
        resolveKineticContactPass(tick);
        assert.equal(sleeper.isSleeping, false);
    });
});
describe("kinetic pair stream on proof props", () => {
    it("resting crate stack emits no pairs until one body moves", () => {
        const bottom = new WorldProp(0, 0, "box", 0);
        const top = new WorldProp(0, 14, "box", 0);
        separatePairUntilClear(bottom, top);
        const frame = setupKineticTestFrame([bottom, top]);
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, pairBuffer);
        assert.equal(pairBuffer.count, 0);
        top.vx = 12;
        snapshotKineticBodySlab(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, pairBuffer);
        assert.equal(pairBuffer.count, 1);
    });
    it("contact pass still separates moving circle pair after pair-stream refactor", () => {
        const a = mockKineticCircle(0, 0, 10, 50, 0);
        const b = mockKineticCircle(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(kineticDynamicSlab.x[a._physId] < 0);
        assert.ok(kineticDynamicSlab.x[b._physId] > 15);
    });
    it("contact pass still ignores resting overlapping circles", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(15, 0, 10, 0, 0);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
    });
});
