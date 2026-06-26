import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldProp } from "../Entities/WorldProp.js";
import { SatCollision, entityFacing, SAT_RESULT } from "../Libraries/Spatial/collision/SatCollision.js";
import { separateAlongNormal } from "../Libraries/Spatial/collision/penetration.js";
import { allowsKineticCollisionPair, pairBroadphaseOverlap, pairBroadphaseOverlapSnapshotted, snapshotActiveBroadphaseBounds } from "../Libraries/Spatial/collision/entityBroadphase.js";
import { gatherKineticCandidatePairs, kineticPairBodyAt, kineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { createKineticTestTick, mockKineticCircle, setupKineticTestFrame } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const collided = SatCollision.checkCollision(a.x, a.y, entityFacing(a), a.getShape(), b.x, b.y, entityFacing(b), b.getShape());
        if (!collided) return;
        const overlap = SAT_RESULT[0];
        const nx = SAT_RESULT[1];
        const ny = SAT_RESULT[2];
        const coincident = SAT_RESULT[5] !== 0;
        if (coincident) return;
        separateAlongNormal(a, b, nx, ny, overlap, a.mass, b.mass);
    }
}
function pairKeys(pairs, spatialFrame) {
    const keys = [];
    for (let i = 0; i < pairs.count; i++) {
        const bodyA = kineticPairBodyAt(spatialFrame, pairs.physIdA[i]);
        const bodyB = kineticPairBodyAt(spatialFrame, pairs.physIdB[i]);
        const lo = Math.min(bodyA.id, bodyB.id);
        const hi = Math.max(bodyA.id, bodyB.id);
        keys.push(lo * 1_000_000 + hi);
    }
    keys.sort((a, b) => a - b);
    return keys;
}
describe("kinetic pair stream", () => {
    it("snapshotted broadphase overlap matches live bounds query", () => {
        const a = mockKineticCircle(0, 0, 10);
        const b = mockKineticCircle(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotActiveBroadphaseBounds([a, b]);
        assert.equal(pairBroadphaseOverlapSnapshotted(a, b), pairBroadphaseOverlap(a, b));
    });
    it("slab-backed pair policy matches live bounds overlap", () => {
        const rest = mockKineticCircle(0, 0, 10, 0, 0);
        const mover = mockKineticCircle(18, 0, 10, 20, 0);
        rest._physId = 0;
        mover._physId = 1;
        snapshotActiveBroadphaseBounds([rest, mover]);
        assert.equal(
            allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlapSnapshotted(rest, mover)),
            allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlap(rest, mover)),
        );
    });
    it("resting overlapping circles emit no candidate pairs", () => {
        const a = mockKineticCircle(0, 0, 10, 0, 0);
        const b = mockKineticCircle(18, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 0);
    });
    it("moving circle against resting neighbor emits one ordered pair", () => {
        const a = mockKineticCircle(0, 0, 10, 30, 0);
        const b = mockKineticCircle(18, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([a, b]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 1);
        assert.equal(kineticPairBodyAt(frame, kineticPairBuffer.physIdA[0]).id, a.id);
        assert.equal(kineticPairBodyAt(frame, kineticPairBuffer.physIdB[0]).id, b.id);
    });
    it("three-body contact emits each pair once", () => {
        const left = mockKineticCircle(0, 0, 10, 0, 0);
        const center = mockKineticCircle(18, 0, 10, 25, 0);
        const right = mockKineticCircle(36, 0, 10, 0, 0);
        const frame = setupKineticTestFrame([left, center, right]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.deepEqual(pairKeys(kineticPairBuffer, frame), [left.id * 1_000_000 + center.id, center.id * 1_000_000 + right.id]);
    });
    it("moving body wakes sleeping overlapping neighbor during pair gather", () => {
        const mover = mockKineticCircle(0, 0, 10, 40, 0);
        const sleeper = mockKineticCircle(18, 0, 10, 0, 0);
        sleeper.isSleeping = true;
        const frame = setupKineticTestFrame([mover, sleeper]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(sleeper.isSleeping, false);
        assert.equal(kineticPairBuffer.count, 1);
    });
});
describe("kinetic pair stream on proof props", () => {
    it("resting crate stack emits no pairs until one body moves", () => {
        const bottom = new WorldProp(0, 0, "crate", 0);
        const top = new WorldProp(0, 14, "crate", 0);
        separatePairUntilClear(bottom, top);
        const frame = setupKineticTestFrame([bottom, top]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 0);
        top.vx = 12;
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 1);
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
