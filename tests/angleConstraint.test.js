import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addAngleConstraint, runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { kineticDynamicSlab } from "../Core/engineMemory.js";
import { createKineticTestTick, mockKineticCircle, noop } from "./harness/kineticTickHarness.js";

describe("angle constraint solver", () => {
    it("locks the angle of two connected bodies and propagates torque", () => {
        const bodyA = mockKineticCircle(0, 0, 10);
        const bodyB = mockKineticCircle(30, 0, 10);
        bodyA.facing = 0.5;
        bodyB.facing = 0.0;
        const referenceAngle = -0.5;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addAngleConstraint(tick.world.kinetic, 0, 1, referenceAngle);
        runCollisionPipeline(tick, noop, noop);
        assert.ok(Math.abs(bodyB.facing - (bodyA.facing + referenceAngle)) < 1e-4);
        bodyA.facing = 0.5;
        bodyB.facing = 0.0;
        bodyA.angularVelocity = 2.0;
        runCollisionPipeline(tick, noop, noop);
        const wA = kineticDynamicSlab.w[0];
        const wB = kineticDynamicSlab.w[1];
        assert.ok(Math.abs(wA - 1.0) < 0.1, `expected wA ~1.0, got ${wA}`);
        assert.ok(Math.abs(wB - 1.0) < 0.1, `expected wB ~1.0, got ${wB}`);
    });

    it("corrects angle offset during position projection pass", () => {
        const bodyA = mockKineticCircle(0, 0, 10);
        const bodyB = mockKineticCircle(30, 0, 10);
        bodyA.facing = 1.0;
        bodyB.facing = 0.0;
        const referenceAngle = 0.0;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addAngleConstraint(tick.world.kinetic, 0, 1, referenceAngle);
        runCollisionPipeline(tick, noop, noop);
        assert.ok(Math.abs(bodyA.facing - 0.5) < 1e-4, `expected bodyA.facing ~0.5, got ${bodyA.facing}`);
        assert.ok(Math.abs(bodyB.facing - 0.5) < 1e-4, `expected bodyB.facing ~0.5, got ${bodyB.facing}`);
    });
});
