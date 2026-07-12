import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldProp } from "../Libraries/Props/props.js";
import { createKineticTestTick, kineticIntegrateHooks, mockKineticCircle } from "./harness/kineticTickHarness.js";
import { runKineticPhysics, checkEntityPairCollision, normalizeKineticBody, kineticInertiaFromBody, kineticFootprintArea } from "../Libraries/Physics/physics.js";
import { SHAPE_TYPE_POLYGON } from "../Core/engineEnums.js";
import { ENGINE_F32 } from "../Core/engineMemory.js";
import { kineticStaticSlab } from "../Core/engineMemory.js";
import { applyCrossPinwheelFootprint } from "../Libraries/Props/props.js";
import { assignPhysIdWithPose } from "./harness/kineticTickHarness.js";
import { FractureEngine, F_OUT_DEBRIS_START, F_OUT_DEBRIS_COUNT } from "../Libraries/Physics/fracture.js";
import { createFractureWorld } from "./harness/fractureHarness.js";

describe("cross pinwheel prop", () => {
    it("initializes as a kinetic compound body", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.equal(pinwheel.strategy.isKinetic, true);
        assert.ok(pinwheel.collisionParts.length > 1, "Should have multiple collision parts");
        assert.equal(pinwheel.collisionParts[0].shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(pinwheel.collisionParts[1].shapeTypeId, SHAPE_TYPE_POLYGON);
        assert.equal(kineticFootprintArea(pinwheel), 512);
        assert.ok(pinwheel.mass > 0);
        assert.ok(kineticInertiaFromBody(pinwheel) > 0);
        assignPhysIdWithPose(pinwheel, 0);
        normalizeKineticBody(pinwheel);
        assert.ok(kineticStaticSlab.invMass[0] > 0);
    });

    it("absorbs angular velocity and rotates when hit", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        const projectile = mockKineticCircle(12, 15, 4, 0, -100, {
            strategy: { isKinetic: true },
            update(dt) {
                this.x += (this.vx ?? 0) * (dt / 1000);
                this.y += (this.vy ?? 0) * (dt / 1000);
            },
        });

        const tick = createKineticTestTick([pinwheel, projectile]);
        assert.equal(pinwheel.angularVelocity, 0);
        const originalFacing = pinwheel.facing;

        runKineticPhysics(tick, 100, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));
        runKineticPhysics(tick, 50, kineticIntegrateHooks((prop, subDt) => prop.update(subDt)));

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

    it("angular velocity decays after spin", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        pinwheel.angularVelocity = 5;
        for (let i = 0; i < 120; i++) pinwheel.tickPropSubstep(16);
        assert.ok(Math.abs(pinwheel.angularVelocity) < 0.1, `spin should decay, got ${pinwheel.angularVelocity}`);
        assert.equal(pinwheel.vx, 0);
        assert.equal(pinwheel.vy, 0);
    });

    it("can customize dimensions and resizes shape parts", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        applyCrossPinwheelFootprint(pinwheel, 48, 10);

        assert.equal(pinwheel.crossLength, 48);
        assert.equal(pinwheel.crossThickness, 10);
        assert.ok(Math.abs(pinwheel.radius - Math.hypot(24, 5)) < 1e-6);

        const part0 = pinwheel.collisionParts[0];
        assert.equal(part0.vertices[0], -24);
        assert.equal(part0.vertices[1], -5);
        assert.equal(part0.vertices[4], 24);
        assert.equal(part0.vertices[5], 5);
        assert.equal(kineticFootprintArea(pinwheel), 960);
        assignPhysIdWithPose(pinwheel, 1);
        normalizeKineticBody(pinwheel);
        assert.ok(kineticStaticSlab.invMass[1] > 0);
        assert.equal(pinwheel.drawOutline.length, 24);
    });

    it("sets drawOutline for pinwheel only", () => {
        const pinwheel = new WorldProp(0, 0, "cross_pinwheel", 0);
        assert.ok(pinwheel.drawOutline instanceof Float32Array);
        assert.equal(pinwheel.drawOutline.length, 24);

        const star = new WorldProp(0, 0, "star_block", 0);
        assert.equal(star.drawOutline, undefined);

        const gear = new WorldProp(0, 0, "gear_block", 0);
        assert.equal(gear.drawOutline, undefined);
    });

    it("fracture shatters both cross arms", () => {
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
        assert.ok(count >= 4, `expected shards from both arms, got ${count}`);
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
