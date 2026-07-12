import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp, setCirclePropRadius } from "../Libraries/Props/props.js";
import { createKineticTestTick, kineticIntegrateHooks, mockKineticCircle, assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { runKineticPhysics, checkEntityPairCollision, normalizeKineticBody, kineticInertiaFromBody, kineticFootprintArea, gatherKineticContactPairs, resolveKineticContactPassWithPairs } from "../Libraries/Physics/physics.js";
import { SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENGINE_F32, kineticStaticSlab } from "../Core/engineMemory.js";
import { polygonSignedArea2D } from "../Libraries/Math/math.js";
import { FractureEngine, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT } from "../Libraries/Physics/fracture.js";
import { createFractureWorld } from "./harness/fractureHarness.js";
import { checkPairAtSlabPose } from "./harness/kineticContactHarness.js";

describe("cross pinwheel prop", () => {
    it("initializes as a kinetic compound from concave localFootprint", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.equal(pinwheel.strategy.isKinetic, true);
        assert.ok(pinwheel.collisionParts.length > 1, "Should have multiple collision parts");
        assert.equal(pinwheel.collisionParts[0].shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.ok(pinwheel.drawOutline instanceof Float32Array);
        assert.equal(pinwheel.drawOutline.length, 24);
        assert.equal(kineticFootprintArea(pinwheel), Math.abs(polygonSignedArea2D(pinwheel.strategy.localFootprint)));
        assert.ok(pinwheel.mass > 0);
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

        for (let i = 0; i < 12; i++) runKineticPhysics(tick, 16, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));

        assert.ok(Math.abs(pinwheel.angularVelocity) > 0.01, `Should have non-zero angular velocity, got ${pinwheel.angularVelocity}`);
        assert.notEqual(pinwheel.facing, originalFacing);
    });

    it("detects overlap between two crosses", () => {
        const left = new WorldProp(0, 0, "cross_pinwheel", 0);
        const right = new WorldProp(28, 0, "cross_pinwheel", 0);
        assert.ok(checkEntityPairCollision(left, right));
        right.x = 64;
        assert.equal(checkEntityPairCollision(left, right), false);
    });

    it("separates two overlapping crosses", () => {
        const left = new WorldProp(0, 0, "cross_pinwheel", 0);
        const right = new WorldProp(28, 0, "cross_pinwheel", 0);
        right.vx = -20;
        assert.ok(checkEntityPairCollision(left, right));
        const tick = createKineticTestTick([left, right]);
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count >= 1, "expected gathered compound pair");
        for (let pass = 0; pass < 12; pass++) {
            resolveKineticContactPassWithPairs(tick, pairs);
            if (!checkPairAtSlabPose(left, right)) break;
        }
        assert.equal(checkPairAtSlabPose(left, right), false);
    });

    it("box vs pinwheel emits multi-part contacts", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const box = new WorldProp(0, 0, "box", 0);
        box.vx = -1;
        assert.ok(checkEntityPairCollision(pinwheel, box));
        const tick = createKineticTestTick([pinwheel, box]);
        const contacts = resolveKineticContactPassWithPairs(tick, gatherKineticContactPairs(tick));
        assert.ok(contacts.count >= 2, `expected multi-part contacts, got ${contacts.count}`);
    });

    it("ball in pinwheel crotch clears both arms", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const ball = new WorldProp(6, 6, "ball", 0);
        setCirclePropRadius(ball, 4);
        ball.vx = -1;
        ball.vy = -1;
        assert.ok(checkEntityPairCollision(pinwheel, ball));
        const tick = createKineticTestTick([pinwheel, ball]);
        const pairs = gatherKineticContactPairs(tick);
        assert.ok(pairs.count >= 1, "expected gathered compound pair");
        for (let pass = 0; pass < 12; pass++) {
            resolveKineticContactPassWithPairs(tick, pairs);
            if (!checkPairAtSlabPose(pinwheel, ball)) break;
        }
        assert.equal(checkPairAtSlabPose(pinwheel, ball), false);
    });

    it("angular velocity decays after spin", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        pinwheel.angularVelocity = 5;
        for (let i = 0; i < 120; i++) pinwheel.tickPropSubstep(16);
        assert.ok(Math.abs(pinwheel.angularVelocity) < 0.1, `spin should decay, got ${pinwheel.angularVelocity}`);
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);
    });

    it("fracture shatters across compound parts", () => {
        const world = createFractureWorld();
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        pinwheel.fractureEnabled = true;
        assignPhysIdWithPose(pinwheel, 0);
        const fullArea = kineticFootprintArea(pinwheel);
        assert.ok(FractureEngine.canFracturePropSplit(pinwheel));
        assert.ok(FractureEngine.fracturePropOnImpact(pinwheel, 0, 0, 40, world.fractureEngine));
        const stores = world.fractureEngine.stores;
        const start = ENGINE_F32[F_OUT_DEBRIS_START];
        const count = ENGINE_F32[F_OUT_DEBRIS_COUNT];
        assert.ok(count >= 4, `expected shards from compound parts, got ${count}`);
        let shardArea = 0;
        let maxAbsCx = 0;
        let maxAbsCy = 0;
        for (let i = start; i < start + count; i++) {
            shardArea += stores.debris.footprintArea[i];
            maxAbsCx = Math.max(maxAbsCx, Math.abs(stores.debris.centroidX[i]));
            maxAbsCy = Math.max(maxAbsCy, Math.abs(stores.debris.centroidY[i]));
        }
        assert.ok(shardArea > fullArea * 0.55, `shard area ${shardArea} should cover most of compound area ${fullArea}`);
        assert.ok(maxAbsCx > 4 && maxAbsCy > 4, `centroids should span both arms (maxAbsCx=${maxAbsCx}, maxAbsCy=${maxAbsCy})`);
    });
});
