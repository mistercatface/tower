import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPropAssets } from "../Libraries/Props/loadPropAssets.js";
import { WorldProp } from "../Entities/WorldProp.js";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { SatCollision } from "../Libraries/Spatial/collision/SatCollision.js";
import { separateAlongNormal } from "../Libraries/Spatial/collision/penetration.js";
import { KineticSpatialFrame } from "../Systems/World/KineticSpatialFrame.js";
import {
    allowsKineticCollisionPair,
    pairBroadphaseOverlap,
    pairBroadphaseOverlapSnapshotted,
    snapshotActiveBroadphaseBounds,
} from "../Libraries/Spatial/collision/entityBroadphase.js";
import { gatherKineticCandidatePairs, kineticPairBodyAt, kineticPairBuffer } from "../Libraries/Spatial/collision/kineticPairStream.js";
import { kineticDynamicSlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
loadPropAssets();
let nextId = 1;
function mockCircleBody(x, y, radius, vx = 0, vy = 0) {
    return {
        id: nextId++,
        x,
        y,
        radius,
        vx,
        vy,
        angularVelocity: 0,
        isSleeping: false,
        strategy: { isKinetic: true },
        mass: radius,
        get momentOfInertia() {
            return this.mass * this.radius * this.radius * 0.5;
        },
        getShape() {
            return new CircleShape(this.radius);
        },
    };
}
function setupActiveFrame(bodies) {
    const frame = new KineticSpatialFrame(50);
    frame.resetFrame({ minX: -500, maxX: 500, minY: -500, maxY: 500 });
    for (let i = 0; i < bodies.length; i++) {
        frame.insertEntity(bodies[i], i);
        bodies[i]._physId = i;
    }
    frame._kineticBodies = bodies.slice();
    frame.syncActiveKineticBodies();
    return frame;
}
function separatePairUntilClear(a, b, maxPasses = 8) {
    for (let pass = 0; pass < maxPasses; pass++) {
        const info = SatCollision.checkCollision(a, a.getShape(), b, b.getShape());
        if (!info || info.coincident) return;
        separateAlongNormal(a, b, info.nx, info.ny, info.overlap, a.mass, b.mass);
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
        const a = mockCircleBody(0, 0, 10);
        const b = mockCircleBody(18, 0, 10);
        a._physId = 0;
        b._physId = 1;
        snapshotActiveBroadphaseBounds([a, b]);
        assert.equal(pairBroadphaseOverlapSnapshotted(a, b), pairBroadphaseOverlap(a, b));
    });
    it("slab-backed pair policy matches live bounds overlap", () => {
        const rest = mockCircleBody(0, 0, 10, 0, 0);
        const mover = mockCircleBody(18, 0, 10, 20, 0);
        rest._physId = 0;
        mover._physId = 1;
        snapshotActiveBroadphaseBounds([rest, mover]);
        assert.equal(
            allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlapSnapshotted(rest, mover)),
            allowsKineticCollisionPair(rest, mover, pairBroadphaseOverlap(rest, mover)),
        );
    });
    it("resting overlapping circles emit no candidate pairs", () => {
        const a = mockCircleBody(0, 0, 10, 0, 0);
        const b = mockCircleBody(18, 0, 10, 0, 0);
        const frame = setupActiveFrame([a, b]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 0);
    });
    it("moving circle against resting neighbor emits one ordered pair", () => {
        const a = mockCircleBody(0, 0, 10, 30, 0);
        const b = mockCircleBody(18, 0, 10, 0, 0);
        const frame = setupActiveFrame([a, b]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 1);
        assert.equal(kineticPairBodyAt(frame, kineticPairBuffer.physIdA[0]).id, a.id);
        assert.equal(kineticPairBodyAt(frame, kineticPairBuffer.physIdB[0]).id, b.id);
    });
    it("three-body contact emits each pair once", () => {
        const left = mockCircleBody(0, 0, 10, 0, 0);
        const center = mockCircleBody(18, 0, 10, 25, 0);
        const right = mockCircleBody(36, 0, 10, 0, 0);
        const frame = setupActiveFrame([left, center, right]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.deepEqual(pairKeys(kineticPairBuffer, frame), [left.id * 1_000_000 + center.id, center.id * 1_000_000 + right.id]);
    });
    it("moving body wakes sleeping overlapping neighbor during pair gather", () => {
        const mover = mockCircleBody(0, 0, 10, 40, 0);
        const sleeper = mockCircleBody(18, 0, 10, 0, 0);
        sleeper.isSleeping = true;
        const frame = setupActiveFrame([mover, sleeper]);
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
        const frame = setupActiveFrame([bottom, top]);
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 0);
        top.vx = 12;
        snapshotActiveBroadphaseBounds(frame._activeKineticBodies);
        gatherKineticCandidatePairs(frame, kineticPairBuffer);
        assert.equal(kineticPairBuffer.count, 1);
    });
    it("contact pass still separates moving circle pair after pair-stream refactor", () => {
        const a = mockCircleBody(0, 0, 10, 50, 0);
        const b = mockCircleBody(15, 0, 10, -30, 0);
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.ok(kineticDynamicSlab.x[a._physId] < 0);
        assert.ok(kineticDynamicSlab.x[b._physId] > 15);
    });
    it("contact pass still ignores resting overlapping circles", () => {
        const a = mockCircleBody(0, 0, 10, 0, 0);
        const b = mockCircleBody(15, 0, 10, 0, 0);
        const ax0 = a.x;
        const bx0 = b.x;
        resolveKineticContactPass(createKineticTestTick([a, b]));
        assert.equal(a.x, ax0);
        assert.equal(b.x, bx0);
    });
});
