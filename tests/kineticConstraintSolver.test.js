import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { addDistanceConstraint, pruneKineticConstraintsForBody, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { gatherKineticConstraintSlab, resolveGatheredKineticConstraintSlab, kineticConstraintSlab } from "../Libraries/Motion/kineticConstraintSolver.js";
import { kineticBodySlab } from "../Libraries/Spatial/collision/kineticBodySlab.js";
import { resolveKineticContactPass } from "./harness/kineticContactHarness.js";
import { createKineticTestTick } from "./harness/kineticTickHarness.js";

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

describe("kinetic constraint solver", () => {
    it("pulls stretched distance joint back toward rest length", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        const restLength = 30;
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength });
        bodyB.x = 50;
        gatherKineticConstraintSlab(tick);
        for (let pass = 0; pass < 8; pass++) resolveGatheredKineticConstraintSlab(tick);
        const dist = Math.hypot(kineticBodySlab.x[bodyB._physId] - kineticBodySlab.x[bodyA._physId], kineticBodySlab.y[bodyB._physId] - kineticBodySlab.y[bodyA._physId]);
        assert.ok(Math.abs(dist - restLength) < 0.5, `expected ~${restLength}, got ${dist}`);
    });
    it("leaves unlinked bodies unchanged when contact pass runs", () => {
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(40, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB]);
        const ax = bodyA.x;
        const bx = bodyB.x;
        resolveKineticContactPass(tick);
        gatherKineticConstraintSlab(tick);
        resolveGatheredKineticConstraintSlab(tick);
        assert.equal(bodyA.x, ax);
        assert.equal(bodyB.x, bx);
    });
    it("drops constraints when a linked body is removed", () => {
        resetKineticConstraintIds(1);
        const bodyA = mockCircleBody(0, 0, 10);
        const bodyB = mockCircleBody(30, 0, 10);
        const tick = createKineticTestTick([bodyA, bodyB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA, bodyB, restLength: 30 });
        assert.equal(tick.world.kinetic.kineticConstraints.length, 1);
        pruneKineticConstraintsForBody(tick.world.kinetic, bodyB.id);
        assert.equal(tick.world.kinetic.kineticConstraints.length, 0);
    });
    it("partitions sleeping link islands out of activeCount", () => {
        resetKineticConstraintIds(1);
        const asleepA = mockCircleBody(0, 0, 10);
        const asleepB = mockCircleBody(20, 0, 10);
        const awakeA = mockCircleBody(0, 40, 10, 10, 0);
        const awakeB = mockCircleBody(20, 40, 10);
        asleepA.isSleeping = true;
        asleepB.isSleeping = true;
        const tick = createKineticTestTick([asleepA, asleepB, awakeA, awakeB]);
        addDistanceConstraint(tick.world.kinetic, { bodyA: asleepA, bodyB: asleepB, restLength: 20 });
        addDistanceConstraint(tick.world.kinetic, { bodyA: awakeA, bodyB: awakeB, restLength: 20 });
        gatherKineticConstraintSlab(tick);
        assert.equal(kineticConstraintSlab.count, 2);
        assert.equal(kineticConstraintSlab.activeCount, 1);
    });
});
