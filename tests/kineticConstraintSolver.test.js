import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircleShape } from "../Libraries/Spatial/collision/Shapes.js";
import { addDistanceConstraint, pruneKineticConstraintsForBody, resetKineticConstraintIds } from "../Libraries/Motion/kineticConstraints.js";
import { distanceBetweenAnchors } from "../Libraries/Motion/constraintAnchors.js";
import { gatherKineticConstraintSlab, resolveGatheredKineticConstraintSlab } from "../Libraries/Motion/kineticConstraintSolver.js";
import { resolveKineticContactPass } from "../Libraries/Spatial/collision/kineticContactSolver.js";
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
        const dist = distanceBetweenAnchors(bodyA, { x: 0, y: 0 }, bodyB, { x: 0, y: 0 });
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
});
