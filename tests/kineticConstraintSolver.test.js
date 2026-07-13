import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDistanceConstraint, pruneKineticConstraintsForBody, runCollisionPipeline } from "../Libraries/Physics/physics.js";
import { kineticConstraintStore, kineticDynamicSlab } from "../Core/engineMemory.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick, mockKineticCircle, noop } from "./harness/kineticTickHarness.js";

describe("kinetic constraint solver", () => {
    it("pulls stretched distance joint back toward rest length", () => {
        const bodyA = mockKineticCircle(0, 0, 10);
        const bodyB = mockKineticCircle(30, 0, 10);
        const restLength = 30;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, 0, 1, { restLength });
        bodyB.x = 50;
        for (let pass = 0; pass < 8; pass++) runCollisionPipeline(tick.frame, tick.world, noop, noop);
        const dist = Math.hypot(kineticDynamicSlab.x[bodyB._physId] - kineticDynamicSlab.x[bodyA._physId], kineticDynamicSlab.y[bodyB._physId] - kineticDynamicSlab.y[bodyA._physId]);
        assert.ok(Math.abs(dist - restLength) < 0.5, `expected ~${restLength}, got ${dist}`);
    });
    it("leaves unlinked bodies unchanged when contact pass runs", () => {
        const bodyA = mockKineticCircle(0, 0, 10);
        const bodyB = mockKineticCircle(40, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB]);
        const ax = bodyA.x;
        const bx = bodyB.x;
        resolveKineticContactPass(tick);
        assert.equal(bodyA.x, ax);
        assert.equal(bodyB.x, bx);
    });
    it("drops constraints when a linked body is removed", () => {
        const bodyA = mockKineticCircle(0, 0, 10);
        const bodyB = mockKineticCircle(30, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, 0, 1, { restLength: 30 });
        assert.equal(kineticConstraintStore.count, 1);
        pruneKineticConstraintsForBody(tick.world.kinetic, bodyB.id);
        assert.equal(kineticConstraintStore.count, 0);
    });
});
