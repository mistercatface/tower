import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, setCirclePropRadius } from "../Libraries/Props/props.js";
import {createKineticTestTick, kineticPhysicsHooks, mockKineticCircle, assignPhysIdWithPose, snapshotKineticBodySlab} from "./harness/kineticTickHarness.js";
import { runKineticPhysics, normalizeKineticBody, kineticInertiaFromBody, kineticFootprintArea, kineticMassFromFootprint, applyVelocityDamping, primitiveDragFrictionEid } from "../Libraries/Physics/physics.js";
import { SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENGINE_F32, kineticStaticSlab, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT, F_OUT_REMNANT } from "../Core/engineMemory.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { FractureEngine } from "../Libraries/Physics/fracture.js";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { checkPairAtSlabPose, resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { kineticContactBuffer } from "../Core/engineMemory.js";

describe("cross pinwheel prop", () => {
    it("initializes as a kinetic compound from concave localFootprint", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.equal(pinwheel.strategy.isKinetic, true);
        assert.ok(pinwheel.collisionParts.length > 1, "Should have multiple collision parts");
        assert.equal(pinwheel.collisionParts[0].shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.ok(pinwheel.drawOutline instanceof Float32Array);
        assert.equal(pinwheel.drawOutline.length, 24);
        assert.equal(kineticFootprintArea(pinwheel), Math.abs(polygonSignedArea2D(pinwheel.strategy.localFootprint)));
        assert.ok(kineticMassFromFootprint(pinwheel) > 0);
        assert.ok(kineticInertiaFromBody(pinwheel) > 0);
        assignPhysIdWithPose(pinwheel, 0);
        normalizeKineticBody(pinwheel);
        assert.ok(kineticStaticSlab.invMass[0] > 0);
    });

    it("absorbs angular velocity and rotates when hit", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const projectile = mockKineticCircle(12, 10, 4, 0, -80, {
            strategy: { isKinetic: true },
            update(dt) {
                this.x += (this.vx ?? 0) * (dt / 1000);
                this.y += (this.vy ?? 0) * (dt / 1000);
            },
        });

        const tick = createKineticTestTick([pinwheel, projectile]);
        assert.equal(pinwheel.angularVelocity, 0);
        const originalFacing = pinwheel.facing;

        for (let i = 0; i < 12; i++) runKineticPhysics(tick.frame, tick.world, 16, kineticPhysicsHooks());

        assert.ok(Math.abs(pinwheel.angularVelocity) > 0.01, `Should have non-zero angular velocity, got ${pinwheel.angularVelocity}`);
        assert.notEqual(pinwheel.facing, originalFacing);
    });

    it("detects overlap between two crosses", () => {
        const left = new WorldProp(0, 0, "cross_pinwheel", 0);
        const right = new WorldProp(28, 0, "cross_pinwheel", 0);
        assignPhysIdWithPose(left, 0);
        assignPhysIdWithPose(right, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(left, right));
        right.x = 64;
        assert.equal(checkPairAtSlabPose(left, right), false);
    });

    it("separates two overlapping crosses", () => {
        const left = new WorldProp(0, 0, "cross_pinwheel", 0);
        const right = new WorldProp(28, 0, "cross_pinwheel", 0);
        right.vx = -20;
        assignPhysIdWithPose(left, 0);
        assignPhysIdWithPose(right, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(left, right));
        const tick = createKineticTestTick([left, right]);
        for (let pass = 0; pass < 12; pass++) {
            resolveKineticContactPass(tick);
            if (!checkPairAtSlabPose(left, right)) break;
        }
        assert.equal(checkPairAtSlabPose(left, right), false);
    });

    it("box vs pinwheel emits multi-part contacts", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const box = new WorldProp(0, 0, "box", 0);
        box.vx = -1;
        assignPhysIdWithPose(pinwheel, 0);
        assignPhysIdWithPose(box, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(pinwheel, box));
        const tick = createKineticTestTick([pinwheel, box]);
        const contacts = resolveKineticContactPass(tick);
        assert.ok(contacts.count >= 2 || kineticContactBuffer.count >= 2, `expected multi-part contacts, got ${contacts.count}`);
    });

    it("ball in pinwheel crotch clears both arms", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const ball = new WorldProp(6, 6, "ball", 0);
        setCirclePropRadius(ball, 4);
        ball.vx = -1;
        ball.vy = -1;
        assignPhysIdWithPose(pinwheel, 0);
        assignPhysIdWithPose(ball, 1);
        snapshotKineticBodySlab([0, 1], 2);
        assert.ok(checkPairAtSlabPose(pinwheel, ball));
        const tick = createKineticTestTick([pinwheel, ball]);
        for (let pass = 0; pass < 12; pass++) {
            resolveKineticContactPass(tick);
            if (!checkPairAtSlabPose(pinwheel, ball)) break;
        }
        assert.equal(checkPairAtSlabPose(pinwheel, ball), false);
    });

    it("angular velocity decays after spin", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assignPhysIdWithPose(pinwheel, 0);
        pinwheel.angularVelocity = 5;
        const eid = pinwheel._physId;
        for (let i = 0; i < 120; i++) applyVelocityDamping(eid, 16, primitiveDragFrictionEid(eid));
        assert.ok(Math.abs(pinwheel.angularVelocity) < 0.1, `spin should decay, got ${pinwheel.angularVelocity}`);
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);
    });

    it("fracture turns compound into debris only", () => {
        const world = createFractureWorld();
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        pinwheel.fractureEnabled = true;
        assignPhysIdWithPose(pinwheel, 0);
        const partCountBefore = pinwheel.collisionParts.length;
        assert.ok(partCountBefore > 1);
        assert.ok(FractureEngine.canFracturePropSplit(pinwheel));
        assert.ok(FractureEngine.fracturePropOnImpact(pinwheel, 14, 0, 40, world.fractureEngine));
        const stores = world.fractureEngine.stores;
        const start = ENGINE_F32[F_OUT_DEBRIS_START];
        const count = ENGINE_F32[F_OUT_DEBRIS_COUNT];
        assert.ok(count >= partCountBefore, `hit shards + survivor parts as debris, got ${count} vs ${partCountBefore} parts`);
        assert.equal(ENGINE_F32[F_OUT_REMNANT], 0, "compound fracture leaves no remant WorldProp");
        assert.equal(pinwheel.collisionParts.length, partCountBefore, "parent geometry untouched until flush removes it");
        assert.ok(pinwheel.drawOutline instanceof Float32Array);
        let maxAbsCx = 0;
        for (let i = start; i < start + count; i++) maxAbsCx = Math.max(maxAbsCx, Math.abs(stores.debris.centroidX[i]));
        assert.ok(maxAbsCx > 2, `debris should span off-hub (maxAbsCx=${maxAbsCx})`);
    });
});
